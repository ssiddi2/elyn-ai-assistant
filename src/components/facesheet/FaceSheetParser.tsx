import { useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useFacility } from '@/contexts/FacilityContext';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { formatClaimsName, validateClaimsData, formatMRN } from '@/lib/claimsFormatting';
import { ClaimsValidationBadge } from '@/components/billing/ClaimsValidationBadge';
import {
  FileText,
  Camera,
  Upload,
  Sparkles,
  User,
  CreditCard,
  Stethoscope,
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Save,
  Loader2,
  ClipboardPaste,
  X,
  ImageIcon,
  RotateCcw,
  Info,
} from 'lucide-react';

interface ParsedData {
  patient: {
    name: string | null;
    dob: string | null;
    mrn: string | null;
    gender: string | null;
    phone: string | null;
    address: string | null;
    emergencyContact: string | null;
  };
  insurance: {
    provider: string | null;
    policyNumber: string | null;
    groupNumber: string | null;
    subscriberName: string | null;
    subscriberDob: string | null;
    relationship: string | null;
    authorizationNumber: string | null;
  };
  medical: {
    allergies: string[];
    medications: string[];
    pastMedicalHistory: string[];
    chiefComplaint: string | null;
    primaryDiagnosis: string | null;
    roomNumber: string | null;
    attendingPhysician: string | null;
    admissionDate: string | null;
  };
  confidence: {
    overall: number;
    patient: number;
    insurance: number;
    medical: number;
  };
}

interface FaceSheetParserProps {
  onPatientCreated?: (patientId: string) => void;
  onToast: (message: string) => void;
}

function ConfidenceBadge({ score }: { score: number }) {
  const percentage = Math.round(score * 100);
  const color = score >= 0.8 ? 'text-green-600 bg-green-500/10' :
                score >= 0.6 ? 'text-amber-600 bg-amber-500/10' :
                'text-red-600 bg-red-500/10';

  return (
    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", color)}>
      {percentage}% confident
    </span>
  );
}

function EditableField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
  type?: 'text' | 'date';
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        placeholder={`Enter ${label.toLowerCase()}`}
      />
    </div>
  );
}

function ArrayField({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [newItem, setNewItem] = useState('');

  const addItem = () => {
    if (newItem.trim()) {
      onChange([...values, newItem.trim()]);
      setNewItem('');
    }
  };

  const removeItem = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="flex flex-wrap gap-2">
        {values.map((item, index) => (
          <span
            key={index}
            className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-full text-xs"
          >
            {item}
            <button
              onClick={() => removeItem(index)}
              className="hover:bg-primary/20 rounded-full p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && addItem()}
          className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          placeholder={`Add ${label.toLowerCase()}`}
        />
        <Button onClick={addItem} size="sm" variant="outline" disabled={!newItem.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}

export default function FaceSheetParser({ onPatientCreated, onToast }: FaceSheetParserProps) {
  const { user } = useAuth();
  const { facilities, selectedFacilityId } = useFacility();
  const [inputMode, setInputMode] = useState<'text' | 'photo'>('text');
  const [inputText, setInputText] = useState('');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    patient: true,
    insurance: true,
    medical: true,
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const defaultFacilityId = selectedFacilityId !== 'all'
    ? selectedFacilityId
    : (facilities.find(f => f.is_default)?.id || facilities[0]?.id || '');

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInputText(text);
      onToast('Pasted from clipboard');
    } catch (e) {
      onToast('Failed to paste from clipboard');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 4MB for base64)
    if (file.size > 4 * 1024 * 1024) {
      onToast('Image too large. Please use an image under 4MB.');
      return;
    }

    try {
      // Compress and convert to base64
      const base64 = await compressAndConvertToBase64(file);
      setCapturedImage(base64);
      onToast('Image captured successfully');
    } catch (e) {
      console.error('Error processing image:', e);
      onToast('Failed to process image');
    }
  };

  const compressAndConvertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // Create canvas for compression
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          // Calculate new dimensions (max 1920px on longest side)
          const maxSize = 1920;
          let width = img.width;
          let height = img.height;

          if (width > height && width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          } else if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }

          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to base64 with compression
          const base64 = canvas.toDataURL('image/jpeg', 0.8);
          resolve(base64);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const clearImage = () => {
    setCapturedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleParse = async () => {
    // Validate input based on mode
    if (inputMode === 'text' && !inputText.trim()) {
      onToast('Please enter or paste face sheet content');
      return;
    }
    if (inputMode === 'photo' && !capturedImage) {
      onToast('Please capture or upload an image');
      return;
    }

    setIsParsing(true);
    try {
      const body = inputMode === 'photo' 
        ? { imageBase64: capturedImage }
        : { text: inputText };

      const { data, error } = await supabase.functions.invoke('parse-face-sheet', {
        body,
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to parse face sheet');

      setParsedData(data.data);
      onToast('Face sheet parsed successfully');
    } catch (e) {
      console.error('Parse error:', e);
      onToast(e instanceof Error ? e.message : 'Failed to parse face sheet');
    }
    setIsParsing(false);
  };

  // Claims validation for current parsed data
  const claimsValidation = useMemo(() => {
    if (!parsedData) return null;
    return validateClaimsData({
      name: parsedData.patient.name,
      dob: parsedData.patient.dob,
      mrn: parsedData.patient.mrn,
      insuranceId: parsedData.insurance.policyNumber,
    });
  }, [parsedData]);

  // Format name for claims when saving
  const handleFormatNameForClaims = () => {
    if (!parsedData?.patient.name) return;
    const formatted = formatClaimsName(parsedData.patient.name);
    updateParsedData('patient', 'name', formatted);
    onToast('Name formatted for claims: ' + formatted);
  };

  const handleSavePatient = async () => {
    if (!parsedData || !user) return;

    // Validate claims data before saving
    const validation = validateClaimsData({
      name: parsedData.patient.name,
      dob: parsedData.patient.dob,
      mrn: parsedData.patient.mrn,
      insuranceId: parsedData.insurance.policyNumber,
    });

    if (!validation.isValid) {
      onToast('Missing required fields: ' + validation.errors.join(', '));
      return;
    }

    setIsSaving(true);
    try {
      // Format name and MRN for claims compliance
      const claimsName = formatClaimsName(parsedData.patient.name);
      const formattedMrn = formatMRN(parsedData.patient.mrn);

      // Create or update patient with insurance info
      const { data: patient, error } = await supabase
        .from('patients')
        .insert({
          user_id: user.id,
          facility_id: defaultFacilityId,
          name: claimsName || 'Unknown Patient',
          mrn: formattedMrn || null,
          dob: parsedData.patient.dob,
          room: parsedData.medical.roomNumber,
          diagnosis: parsedData.medical.primaryDiagnosis,
          allergies: parsedData.medical.allergies,
          insurance_id: parsedData.insurance.policyNumber || null,
          insurance_name: parsedData.insurance.provider || null,
          insurance_group: parsedData.insurance.groupNumber || null,
          subscriber_name: parsedData.insurance.subscriberName || null,
          subscriber_relationship: parsedData.insurance.relationship || null,
        })
        .select()
        .single();

      if (error) throw error;

      onToast('Patient saved with claims-compliant formatting');
      onPatientCreated?.(patient.id);

      // Clear the form
      setInputText('');
      setCapturedImage(null);
      setParsedData(null);
    } catch (e) {
      console.error('Save error:', e);
      onToast('Failed to save patient');
    }
    setIsSaving(false);
  };

  const updateParsedData = (
    section: 'patient' | 'insurance' | 'medical',
    field: string,
    value: string | string[]
  ) => {
    if (!parsedData) return;
    setParsedData({
      ...parsedData,
      [section]: {
        ...parsedData[section],
        [field]: value,
      },
    });
  };

  const hasInput = inputMode === 'text' ? inputText.trim().length > 0 : !!capturedImage;

  return (
    <div className="space-y-4">
      {/* Input Section */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Face Sheet Input
          </h3>
        </div>

        <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'text' | 'photo')} className="w-full">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="text" className="flex-1 gap-2">
              <ClipboardPaste className="w-4 h-4" />
              Paste Text
            </TabsTrigger>
            <TabsTrigger value="photo" className="flex-1 gap-2">
              <Camera className="w-4 h-4" />
              Capture Photo
            </TabsTrigger>
          </TabsList>

          <TabsContent value="text" className="mt-0">
            <div className="flex justify-end mb-2">
              <Button
                onClick={handlePaste}
                variant="outline"
                size="sm"
                className="rounded-lg"
              >
                <ClipboardPaste className="w-4 h-4 mr-1.5" />
                Paste
              </Button>
            </div>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste or type the face sheet content here...&#10;&#10;Include patient demographics, insurance information, medical history, allergies, medications, and any other relevant information from the face sheet."
              className="w-full h-48 px-4 py-3 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
            />
            <p className="text-xs text-muted-foreground mt-2">
              {inputText.length} characters
            </p>
          </TabsContent>

          <TabsContent value="photo" className="mt-0">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />

            {capturedImage ? (
              // Image preview
              <div className="space-y-3">
                <div className="relative rounded-xl overflow-hidden border border-border bg-muted/30">
                  <img 
                    src={capturedImage} 
                    alt="Captured face sheet" 
                    className="w-full h-auto max-h-64 object-contain"
                  />
                  <div className="absolute top-2 right-2 flex gap-2">
                    <Button
                      onClick={clearImage}
                      size="sm"
                      variant="secondary"
                      className="rounded-lg shadow-lg"
                    >
                      <RotateCcw className="w-4 h-4 mr-1.5" />
                      Retake
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Image ready for parsing. Click "Parse with AI" to extract patient data.
                </p>
              </div>
            ) : (
              // Capture buttons
              <div className="border-2 border-dashed border-border rounded-xl p-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                  <ImageIcon className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Capture Face Sheet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Take a photo or upload an image of the printed face sheet
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    variant="default"
                    className="rounded-xl gap-2"
                  >
                    <Camera className="w-4 h-4" />
                    Take Photo
                  </Button>
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    variant="outline"
                    className="rounded-xl gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Upload Image
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  💡 Tip: Ensure good lighting and hold the camera steady for best results
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex justify-end mt-4">
          <Button
            onClick={handleParse}
            disabled={isParsing || !hasInput}
            className="rounded-xl bg-primary hover:bg-primary/90"
          >
            {isParsing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {inputMode === 'photo' ? 'Reading Image...' : 'Parsing...'}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Parse with AI
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Parsed Results */}
      <AnimatePresence>
        {parsedData && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
            {/* Overall Confidence */}
            <div className="glass-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Check className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Parsing Complete</h3>
                    <p className="text-sm text-muted-foreground">Review and edit extracted data</p>
                  </div>
                </div>
                <ConfidenceBadge score={parsedData.confidence.overall} />
              </div>
            </div>

            {/* Patient Information */}
            <div className="glass-card overflow-hidden">
              <button
                onClick={() => toggleSection('patient')}
                className="w-full p-4 flex items-center justify-between bg-blue-500/5"
              >
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-500" />
                  <span className="font-semibold text-foreground">Patient Information</span>
                  <ConfidenceBadge score={parsedData.confidence.patient} />
                </div>
                {expandedSections.patient ? (
                  <ChevronUp className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                )}
              </button>
              {expandedSections.patient && (
                <div className="p-4 space-y-4">
                  {/* Claims formatting notice */}
                  <div className="flex items-start gap-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
                    <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">Claims Formatting</p>
                      <p className="mt-0.5">Names will be saved as "LAST, FIRST" uppercase format. Special characters are removed.</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleFormatNameForClaims}
                      className="ml-auto text-xs h-7"
                    >
                      Format Now
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground flex items-center gap-1">
                        Full Name <span className="text-destructive">*</span>
                        {parsedData.patient.name && (
                          <span className="text-muted-foreground/60 ml-1">
                            → {formatClaimsName(parsedData.patient.name)}
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={parsedData.patient.name || ''}
                        onChange={(e) => updateParsedData('patient', 'name', e.target.value)}
                        className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        placeholder="Enter patient name"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">
                        Date of Birth <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="date"
                        value={parsedData.patient.dob || ''}
                        onChange={(e) => updateParsedData('patient', 'dob', e.target.value)}
                        className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">
                        MRN <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        value={parsedData.patient.mrn || ''}
                        onChange={(e) => updateParsedData('patient', 'mrn', e.target.value)}
                        className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        placeholder="Enter MRN"
                      />
                    </div>
                    <EditableField
                      label="Gender"
                      value={parsedData.patient.gender}
                      onChange={(v) => updateParsedData('patient', 'gender', v)}
                    />
                    <EditableField
                      label="Phone"
                      value={parsedData.patient.phone}
                      onChange={(v) => updateParsedData('patient', 'phone', v)}
                    />
                    <EditableField
                      label="Emergency Contact"
                      value={parsedData.patient.emergencyContact}
                      onChange={(v) => updateParsedData('patient', 'emergencyContact', v)}
                    />
                    <div className="md:col-span-2">
                      <EditableField
                        label="Address"
                        value={parsedData.patient.address}
                        onChange={(v) => updateParsedData('patient', 'address', v)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Insurance Information */}
            <div className="glass-card overflow-hidden">
              <button
                onClick={() => toggleSection('insurance')}
                className="w-full p-4 flex items-center justify-between bg-green-500/5"
              >
                <div className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-green-500" />
                  <span className="font-semibold text-foreground">Insurance Information</span>
                  <ConfidenceBadge score={parsedData.confidence.insurance} />
                </div>
                {expandedSections.insurance ? (
                  <ChevronUp className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                )}
              </button>
              {expandedSections.insurance && (
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <EditableField
                    label="Insurance Provider"
                    value={parsedData.insurance.provider}
                    onChange={(v) => updateParsedData('insurance', 'provider', v)}
                  />
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      Policy/Member ID <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={parsedData.insurance.policyNumber || ''}
                      onChange={(e) => updateParsedData('insurance', 'policyNumber', e.target.value)}
                      className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder="Enter policy/member ID"
                    />
                  </div>
                  <EditableField
                    label="Group Number"
                    value={parsedData.insurance.groupNumber}
                    onChange={(v) => updateParsedData('insurance', 'groupNumber', v)}
                  />
                  <EditableField
                    label="Subscriber Name"
                    value={parsedData.insurance.subscriberName}
                    onChange={(v) => updateParsedData('insurance', 'subscriberName', v)}
                  />
                  <EditableField
                    label="Subscriber DOB"
                    value={parsedData.insurance.subscriberDob}
                    onChange={(v) => updateParsedData('insurance', 'subscriberDob', v)}
                    type="date"
                  />
                  <EditableField
                    label="Relationship"
                    value={parsedData.insurance.relationship}
                    onChange={(v) => updateParsedData('insurance', 'relationship', v)}
                  />
                  <div className="md:col-span-2">
                    <EditableField
                      label="Authorization Number"
                      value={parsedData.insurance.authorizationNumber}
                      onChange={(v) => updateParsedData('insurance', 'authorizationNumber', v)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Medical Information */}
            <div className="glass-card overflow-hidden">
              <button
                onClick={() => toggleSection('medical')}
                className="w-full p-4 flex items-center justify-between bg-purple-500/5"
              >
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-5 h-5 text-purple-500" />
                  <span className="font-semibold text-foreground">Medical Information</span>
                  <ConfidenceBadge score={parsedData.confidence.medical} />
                </div>
                {expandedSections.medical ? (
                  <ChevronUp className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                )}
              </button>
              {expandedSections.medical && (
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <EditableField
                      label="Room Number"
                      value={parsedData.medical.roomNumber}
                      onChange={(v) => updateParsedData('medical', 'roomNumber', v)}
                    />
                    <EditableField
                      label="Attending Physician"
                      value={parsedData.medical.attendingPhysician}
                      onChange={(v) => updateParsedData('medical', 'attendingPhysician', v)}
                    />
                    <EditableField
                      label="Admission Date"
                      value={parsedData.medical.admissionDate}
                      onChange={(v) => updateParsedData('medical', 'admissionDate', v)}
                      type="date"
                    />
                    <EditableField
                      label="Chief Complaint"
                      value={parsedData.medical.chiefComplaint}
                      onChange={(v) => updateParsedData('medical', 'chiefComplaint', v)}
                    />
                    <div className="md:col-span-2">
                      <EditableField
                        label="Primary Diagnosis"
                        value={parsedData.medical.primaryDiagnosis}
                        onChange={(v) => updateParsedData('medical', 'primaryDiagnosis', v)}
                      />
                    </div>
                  </div>

                  <ArrayField
                    label="Allergies"
                    values={parsedData.medical.allergies}
                    onChange={(v) => updateParsedData('medical', 'allergies', v)}
                  />

                  <ArrayField
                    label="Current Medications"
                    values={parsedData.medical.medications}
                    onChange={(v) => updateParsedData('medical', 'medications', v)}
                  />

                  <ArrayField
                    label="Past Medical History"
                    values={parsedData.medical.pastMedicalHistory}
                    onChange={(v) => updateParsedData('medical', 'pastMedicalHistory', v)}
                  />
                </div>
              )}
            </div>

            {/* Save Actions */}
            <div className="glass-card p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2 flex-1">
                  {claimsValidation && (
                    <ClaimsValidationBadge validation={claimsValidation} />
                  )}
                  <p className="text-sm text-muted-foreground ml-2">
                    Review all information before saving. Names will be formatted for claims.
                  </p>
                </div>
                <Button
                  onClick={handleSavePatient}
                  disabled={isSaving || (claimsValidation && !claimsValidation.isValid)}
                  className="rounded-xl bg-green-600 hover:bg-green-700"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save Patient
                    </>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
