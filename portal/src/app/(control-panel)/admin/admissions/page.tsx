"use client";

import { useSession } from "next-auth/react";
import useToast from "@/hooks/useToast";
import { useState, useEffect, useCallback } from "react";
import {
  Paper,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  FormHelperText,
  InputLabel,
  Grid,
  Alert,
  Box,
  Chip,
  CircularProgress,
  OutlinedInput,
  Checkbox,
  ListItemText,
  Radio,
  RadioGroup,
  FormControlLabel,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import FusePageSimple from "@fuse/core/FusePageSimple";
import FuseSvgIcon from "@fuse/core/FuseSvgIcon";
import AuthGuardRedirect from "@auth/AuthGuardRedirect";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { BACKEND_URL } from "@/lib/backend";

const steps = [
  {
    label: "Student",
    title: "Student bio data",
    description: "Identifiers, personal details and the student portal login.",
    icon: "lucide:user",
  },
  {
    label: "Parent / Guardian",
    title: "Parent or guardian",
    description:
      "Enter the phone number first and an existing parent account will be filled in for you.",
    icon: "lucide:users",
  },
  {
    label: "Class & Subjects",
    title: "Class and subjects",
    description: "Place the student in a class and pick their subjects.",
    icon: "lucide:book-open",
  },
  {
    label: "Documents",
    title: "Documents",
    description: "Optional. You can upload these now or add them later.",
    icon: "lucide:file-text",
  },
  {
    label: "Fee Plan",
    title: "Fee plan",
    description:
      "The class's fee structure for this term, and how the parent will pay it.",
    icon: "lucide:wallet",
  },
  {
    label: "Review",
    title: "Review and submit",
    description: "Check everything is correct before admitting the student.",
    icon: "lucide:clipboard-check",
  },
];

const schema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  dob: z.string().min(1, "Date of birth is required"),
  gender: z.string().min(1, "Gender is required"),
  previousSchool: z.string().optional(),
  medicalNotes: z.string().optional(),
  admissionNumber: z.string().min(1, "Admission number is required"),
  nemisNumber: z.string().min(1, "NEMIS number is required"),
  studentEmail: z
    .string()
    .email("Invalid student email")
    .min(1, "Student email is required"),
  studentPassword: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .optional()
    .or(z.literal("")),
  parentName: z.string().min(1, "Parent name is required"),
  parentPhone: z.string().min(1, "Parent phone is required"),
  parentEmail: z
    .string()
    .email("Invalid parent email")
    .optional()
    .or(z.literal("")),
  parentRelationship: z.string().min(1, "Relationship is required"),
  parentPassword: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .optional()
    .or(z.literal("")),
  nationalId: z.string().optional(),
  classId: z.string().min(1, "Class placement is required"),
  subjectIds: z.array(z.string()).min(1, "Select at least one subject"),
  birthCertificateUrl: z.string().optional().or(z.literal("")),
  reportCardUrl: z.string().optional().or(z.literal("")),
  passportPhotoUrl: z.string().optional().or(z.literal("")),
  paymentPlan: z.string().min(1, "Choose a payment plan"),
});

type FormData = z.infer<typeof schema>;

const DEFAULTS: FormData = {
  firstName: "",
  lastName: "",
  dob: "",
  gender: "",
  previousSchool: "",
  medicalNotes: "",
  admissionNumber: "",
  nemisNumber: "",
  studentEmail: "",
  studentPassword: "",
  parentName: "",
  parentPhone: "",
  parentEmail: "",
  parentRelationship: "",
  parentPassword: "",
  nationalId: "",
  classId: "",
  subjectIds: [],
  birthCertificateUrl: "",
  reportCardUrl: "",
  passportPhotoUrl: "",
  paymentPlan: "FULL",
};

type PlanTemplate = {
  code: string;
  name: string;
  milestones: { week: number; percent: number }[];
};

type FeePlanInfo = {
  term: string;
  termStart: string | null;
  structure: {
    id: string;
    name: string;
    total: number;
    items: { name: string; amount: number }[];
  } | null;
  plans: PlanTemplate[];
};

type Draft = {
  id: string;
  label: string;
  step: number;
  data: Partial<FormData>;
  updatedAt: string;
  createdBy: string | null;
};

const formatKes = (n: number) =>
  `KES ${n.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

/** Due date of week n of a term that opens on `start` (YYYY-MM-DD). */
const weekDate = (start: string | null, week: number) =>
  start
    ? new Date(Date.parse(`${start}T00:00:00Z`) + (week - 1) * 7 * 86_400_000)
        .toISOString()
        .slice(0, 10)
    : null;

type DocumentField =
  | "birthCertificateUrl"
  | "reportCardUrl"
  | "passportPhotoUrl";

const ITEM_HEIGHT = 48;
const ITEM_PADDING_TOP = 8;
const MenuProps = {
  PaperProps: {
    style: {
      maxHeight: ITEM_HEIGHT * 4.5 + ITEM_PADDING_TOP,
      width: 250,
    },
  },
};

export default function AdminAdmissions() {
  const { notify, confirm } = useToast();
  const { data: session } = useSession();
  const token = (session as any)?.backendToken;
  const [activeStep, setActiveStep] = useState(0);
  const [submitResult, setSubmitResult] = useState<{
    success?: boolean;
    message?: string;
  } | null>(null);
  const [uploadingField, setUploadingField] = useState<string | null>(null);

  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [existingParent, setExistingParent] = useState<any | null>(null);
  const [feePlan, setFeePlan] = useState<FeePlanInfo | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);

  const {
    control,
    handleSubmit,
    trigger,
    getValues,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULTS,
  });

  const parentPhone = watch("parentPhone");
  const classId = watch("classId");

  const loadDrafts = useCallback(() => {
    if (!token) return;

    fetch(`${BACKEND_URL}/api/students/admission-drafts`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setDrafts(Array.isArray(data) ? data : []))
      .catch((err) => console.error(err));
  }, [token]);

  useEffect(loadDrafts, [loadDrafts]);

  // The fee structure and plans follow the class placement
  useEffect(() => {
    if (!token) return;

    fetch(
      `${BACKEND_URL}/api/students/admission-fee-plan?classId=${encodeURIComponent(classId || "")}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
      .then((res) => (res.ok ? res.json() : null))
      .then(setFeePlan)
      .catch((err) => console.error(err));
  }, [token, classId]);

  const saveDraft = async () => {
    setSavingDraft(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/students/admission-drafts${draftId ? `/${draftId}` : ""}`,
        {
          method: draftId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ data: getValues(), step: activeStep }),
        },
      );
      const body = await res.json();

      if (!res.ok) throw new Error(body.error || "Could not save the draft");

      setDraftId(body.id);
      notify(
        "Draft saved. Passwords aren't stored in drafts; re-enter them before submitting.",
        "success",
      );
      loadDrafts();
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setSavingDraft(false);
    }
  };

  const resumeDraft = (draft: Draft) => {
    reset({ ...DEFAULTS, ...draft.data });
    setDraftId(draft.id);
    setActiveStep(Math.min(draft.step, steps.length - 1));
    setSubmitResult(null);
  };

  const deleteDraft = async (draft: Draft) => {
    if (!(await confirm(`Delete the draft for ${draft.label}?`, { destructive: true })))
      return;

    await fetch(`${BACKEND_URL}/api/students/admission-drafts/${draft.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).catch((err) => console.error(err));

    if (draftId === draft.id) {
      setDraftId(null);
      reset(DEFAULTS);
      setActiveStep(0);
    }

    loadDrafts();
  };

  useEffect(() => {
    if (token) {
      fetch(`${BACKEND_URL}/api/classes`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => setClasses(data || []))
        .catch((err) => console.error(err));

      fetch(`${BACKEND_URL}/api/subjects`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => setSubjects(data || []))
        .catch((err) => console.error(err));
    }
  }, [token]);

  useEffect(() => {
    if (!token || !parentPhone || parentPhone.length < 5) {
      setExistingParent(null);
      return;
    }

    const delayDebounceFn = setTimeout(() => {
      fetch(`${BACKEND_URL}/api/users?role=PARENT&search=${parentPhone}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          const matchedParent = data.users?.find(
            (u: any) => u.phone === parentPhone,
          );

          if (matchedParent) {
            setExistingParent(matchedParent);
            setValue(
              "parentName",
              `${matchedParent.firstName} ${matchedParent.lastName}`,
            );
            setValue("parentEmail", matchedParent.email || "");
            setValue("nationalId", matchedParent.nationalId || "");
          } else {
            setExistingParent(null);
          }
        })
        .catch((err) => console.error(err));
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [parentPhone, token, setValue]);

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    fieldName: DocumentField,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";

    if (!file) return;

    setUploadingField(fieldName);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${BACKEND_URL}/api/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setValue(fieldName, data.url);
      } else {
        const err = await res.json();
        notify(err.error || "Failed to upload file", "error");
      }
    } catch (err: any) {
      notify(err.message || "An error occurred during upload", "error");
    } finally {
      setUploadingField(null);
    }
  };

  const handleNext = async () => {
    let isValid = false;

    if (activeStep === 0)
      isValid = await trigger([
        "firstName",
        "lastName",
        "dob",
        "gender",
        "previousSchool",
        "medicalNotes",
        "studentEmail",
        "studentPassword",
        "admissionNumber",
        "nemisNumber",
      ]);
    else if (activeStep === 1)
      isValid = await trigger([
        "parentName",
        "parentPhone",
        "parentEmail",
        "parentRelationship",
        "parentPassword",
        "nationalId",
      ]);
    else if (activeStep === 2)
      isValid = await trigger(["classId", "subjectIds"]);
    else if (activeStep === 3) isValid = true;
    else if (activeStep === 4) isValid = await trigger(["paymentPlan"]);

    if (isValid) setActiveStep((prev) => prev + 1);
  };

  const handleBack = () => setActiveStep((prev) => prev - 1);

  const subjectName = (id: string) =>
    subjects.find((s) => s.id === id)?.name || id;

  const onSubmit = async (data: FormData) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/students/admit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...data, draftId }),
      });

      if (res.ok) {
        const admitted = await res.json();
        setSubmitResult({
          success: true,
          message: `Student admitted successfully.${admitted.sms ? ` ${admitted.sms}.` : ""}`,
        });
        reset(DEFAULTS);
        setDraftId(null);
        setActiveStep(0);
        loadDrafts();
      } else {
        const error = await res.json();
        setSubmitResult({
          success: false,
          message: error.error || "Failed to admit student",
        });
      }
    } catch (e: any) {
      setSubmitResult({
        success: false,
        message: e.message || "An error occurred",
      });
    }
  };

  const goToStep = (step: number) => {
    if (step < activeStep && !uploadingField) setActiveStep(step);
  };

  const renderDocumentRow = (
    fieldName: DocumentField,
    title: string,
    hint: string,
    accept: string,
    icon: string,
  ) => {
    const url = watch(fieldName);
    const uploading = uploadingField === fieldName;

    return (
      <Paper
        key={fieldName}
        variant="outlined"
        className="flex flex-col gap-4 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-4">
          <Box
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            sx={{
              bgcolor: (theme) =>
                alpha(
                  url
                    ? theme.palette.success.main
                    : theme.palette.secondary.main,
                  0.12,
                ),
              color: url ? "success.main" : "secondary.main",
            }}
          >
            <FuseSvgIcon size={20}>
              {url ? "lucide:circle-check" : icon}
            </FuseSvgIcon>
          </Box>
          <div>
            <Typography className="font-semibold">{title}</Typography>
            <Typography
              variant="body2"
              color={url ? "success.main" : "text.secondary"}
            >
              {uploading ? "Uploading…" : url ? "Uploaded" : hint}
            </Typography>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          {url && (
            <Button
              size="small"
              color="inherit"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              startIcon={
                <FuseSvgIcon size={16}>lucide:external-link</FuseSvgIcon>
              }
            >
              View
            </Button>
          )}
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            component="label"
            className="rounded-full"
            disabled={!!uploadingField}
            startIcon={
              uploading ? (
                <CircularProgress size={14} />
              ) : (
                <FuseSvgIcon size={16}>lucide:upload</FuseSvgIcon>
              )
            }
          >
            {url ? "Replace" : "Upload"}
            <input
              type="file"
              hidden
              onChange={(e) => handleFileUpload(e, fieldName)}
              accept={accept}
            />
          </Button>
        </div>
      </Paper>
    );
  };

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <div className="flex flex-col gap-8">
            <FormSection title="Identifiers">
              <Grid size={{ xs: 12, sm: 6 }}>
                <Controller
                  name="admissionNumber"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Admission Number"
                      fullWidth
                      error={!!errors.admissionNumber}
                      helperText={errors.admissionNumber?.message}
                      placeholder="e.g. ADM101"
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Controller
                  name="nemisNumber"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="NEMIS Number (UPI)"
                      fullWidth
                      error={!!errors.nemisNumber}
                      helperText={errors.nemisNumber?.message}
                      placeholder="e.g. UPI8831A"
                    />
                  )}
                />
              </Grid>
            </FormSection>

            <FormSection title="Personal details">
              <Grid size={{ xs: 12, sm: 6 }}>
                <Controller
                  name="firstName"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="First Name"
                      fullWidth
                      error={!!errors.firstName}
                      helperText={errors.firstName?.message}
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Controller
                  name="lastName"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Last Name"
                      fullWidth
                      error={!!errors.lastName}
                      helperText={errors.lastName?.message}
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Controller
                  name="dob"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Date of Birth"
                      type="date"
                      slotProps={{ inputLabel: { shrink: true } }}
                      fullWidth
                      error={!!errors.dob}
                      helperText={errors.dob?.message}
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Controller
                  name="gender"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth error={!!errors.gender}>
                      <InputLabel>Gender</InputLabel>
                      <Select {...field} label="Gender">
                        <MenuItem value="Male">Male</MenuItem>
                        <MenuItem value="Female">Female</MenuItem>
                      </Select>
                      {errors.gender && (
                        <FormHelperText>{errors.gender.message}</FormHelperText>
                      )}
                    </FormControl>
                  )}
                />
              </Grid>
              <Grid size={12}>
                <Controller
                  name="previousSchool"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Previous School (Optional)"
                      fullWidth
                    />
                  )}
                />
              </Grid>
              <Grid size={12}>
                <Controller
                  name="medicalNotes"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Medical Notes (Optional)"
                      placeholder="Allergies, conditions or anything staff should know"
                      multiline
                      rows={3}
                      fullWidth
                    />
                  )}
                />
              </Grid>
            </FormSection>

            <FormSection
              title="Student portal account"
              description="The student signs in to the portal with these details."
            >
              <Grid size={{ xs: 12, sm: 6 }}>
                <Controller
                  name="studentEmail"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Student Email"
                      type="email"
                      autoComplete="off"
                      fullWidth
                      error={!!errors.studentEmail}
                      helperText={errors.studentEmail?.message}
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Controller
                  name="studentPassword"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Password (Optional)"
                      type="password"
                      autoComplete="new-password"
                      fullWidth
                      error={!!errors.studentPassword}
                      helperText={
                        errors.studentPassword?.message ||
                        "Leave blank to auto-generate"
                      }
                    />
                  )}
                />
              </Grid>
            </FormSection>
          </div>
        );
      case 1:
        return (
          <div className="flex flex-col gap-8">
            {existingParent && (
              <Alert severity="info" className="rounded-xl">
                Existing parent account found for{" "}
                <strong>
                  {existingParent.firstName} {existingParent.lastName}
                </strong>
                . The student will be linked to it, so you can skip the portal
                email and password.
              </Alert>
            )}

            <FormSection title="Contact details">
              <Grid size={{ xs: 12, sm: 6 }}>
                <Controller
                  name="parentPhone"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Phone Number"
                      type="tel"
                      autoComplete="off"
                      fullWidth
                      error={!!errors.parentPhone}
                      helperText={
                        errors.parentPhone?.message ||
                        "Used to look up an existing parent account"
                      }
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Controller
                  name="parentRelationship"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth error={!!errors.parentRelationship}>
                      <InputLabel>Relationship</InputLabel>
                      <Select {...field} label="Relationship">
                        <MenuItem value="Father">Father</MenuItem>
                        <MenuItem value="Mother">Mother</MenuItem>
                        <MenuItem value="Guardian">Guardian</MenuItem>
                      </Select>
                      {errors.parentRelationship && (
                        <FormHelperText>
                          {errors.parentRelationship.message}
                        </FormHelperText>
                      )}
                    </FormControl>
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Controller
                  name="parentName"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Full Name"
                      autoComplete="off"
                      fullWidth
                      error={!!errors.parentName}
                      helperText={errors.parentName?.message}
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Controller
                  name="nationalId"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="National ID (Optional)"
                      autoComplete="off"
                      fullWidth
                    />
                  )}
                />
              </Grid>
            </FormSection>

            <FormSection
              title="Parent portal account"
              description="Lets the parent follow grades, attendance and fees."
            >
              <Grid size={{ xs: 12, sm: 6 }}>
                <Controller
                  name="parentEmail"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Email (Optional)"
                      type="email"
                      autoComplete="off"
                      fullWidth
                      error={!!errors.parentEmail}
                      helperText={errors.parentEmail?.message}
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Controller
                  name="parentPassword"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Password (Optional)"
                      type="password"
                      autoComplete="new-password"
                      fullWidth
                      error={!!errors.parentPassword}
                      helperText={
                        errors.parentPassword?.message ||
                        "Leave blank to auto-generate"
                      }
                    />
                  )}
                />
              </Grid>
            </FormSection>
          </div>
        );
      case 2:
        return (
          <div className="flex flex-col gap-8">
            <FormSection title="Class placement">
              <Grid size={12}>
                <Controller
                  name="classId"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth error={!!errors.classId}>
                      <InputLabel>Class</InputLabel>
                      <Select {...field} label="Class">
                        {classes.map((cls) => (
                          <MenuItem key={cls.id} value={cls.id}>
                            {cls.name}
                          </MenuItem>
                        ))}
                        {classes.length === 0 && (
                          <MenuItem disabled value="">
                            No classes found
                          </MenuItem>
                        )}
                      </Select>
                      {errors.classId && (
                        <FormHelperText>
                          {errors.classId.message}
                        </FormHelperText>
                      )}
                    </FormControl>
                  )}
                />
              </Grid>
            </FormSection>

            <FormSection
              title="Subjects"
              description="Choose every subject the student will take this term."
            >
              <Grid size={12}>
                <Controller
                  name="subjectIds"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth error={!!errors.subjectIds}>
                      <InputLabel>Subjects</InputLabel>
                      <Select
                        {...field}
                        multiple
                        value={Array.isArray(field.value) ? field.value : []}
                        input={<OutlinedInput label="Subjects" />}
                        renderValue={(selected) => (
                          <div className="flex flex-wrap gap-1">
                            {(selected as string[]).map((id) => (
                              <Chip
                                key={id}
                                size="small"
                                label={subjectName(id)}
                              />
                            ))}
                          </div>
                        )}
                        MenuProps={MenuProps}
                      >
                        {subjects.map((subject) => (
                          <MenuItem key={subject.id} value={subject.id}>
                            <Checkbox
                              size="small"
                              checked={
                                Array.isArray(field.value) &&
                                field.value.indexOf(subject.id) > -1
                              }
                            />
                            <ListItemText primary={subject.name} />
                          </MenuItem>
                        ))}
                        {subjects.length === 0 && (
                          <MenuItem disabled value="">
                            No subjects found
                          </MenuItem>
                        )}
                      </Select>
                      <FormHelperText>
                        {errors.subjectIds?.message ||
                          `${Array.isArray(field.value) ? field.value.length : 0} selected`}
                      </FormHelperText>
                    </FormControl>
                  )}
                />
              </Grid>
            </FormSection>
          </div>
        );
      case 3:
        return (
          <div className="flex flex-col gap-3">
            {renderDocumentRow(
              "birthCertificateUrl",
              "Birth Certificate",
              "PDF or image",
              "image/*,application/pdf",
              "lucide:file-text",
            )}
            {renderDocumentRow(
              "reportCardUrl",
              "Previous Report Card",
              "PDF or image",
              "image/*,application/pdf",
              "lucide:file-text",
            )}
            {renderDocumentRow(
              "passportPhotoUrl",
              "Passport Photo",
              "JPG or PNG image",
              "image/*",
              "lucide:image",
            )}
          </div>
        );
      case 4: {
        const values = getValues();
        const total = feePlan?.structure?.total ?? 0;

        return (
          <div className="flex flex-col gap-8">
            <FormSection
              title={`Fee structure · ${feePlan?.term ?? "this term"}`}
              description="Billed automatically when the student is admitted."
            >
              <Grid size={12}>
                {feePlan?.structure ? (
                  <Paper variant="outlined" className="rounded-xl">
                    <dl className="flex flex-col gap-2 px-4 py-3">
                      {feePlan.structure.items.map((item) => (
                        <div
                          key={item.name}
                          className="flex justify-between gap-4 text-sm"
                        >
                          <dt className="text-gray-600">{item.name}</dt>
                          <dd>{formatKes(item.amount)}</dd>
                        </div>
                      ))}
                      <div className="flex justify-between gap-4 border-t pt-2 font-semibold">
                        <dt>{feePlan.structure.name}</dt>
                        <dd>{formatKes(total)}</dd>
                      </div>
                    </dl>
                  </Paper>
                ) : (
                  <Alert severity="warning" className="rounded-xl">
                    This class has no published fee structure for{" "}
                    {feePlan?.term ?? "this term"}, so no bill will be created
                    yet. The student is billed automatically once finance
                    publishes one.
                  </Alert>
                )}
              </Grid>
            </FormSection>

            <FormSection
              title="Payment plan"
              description="Installment milestones are cumulative shares of the term's bill."
            >
              <Grid size={12}>
                <Controller
                  name="paymentPlan"
                  control={control}
                  render={({ field }) => (
                    <RadioGroup {...field} className="flex flex-col gap-2">
                      {(feePlan?.plans ?? []).map((plan) => (
                        <Paper
                          key={plan.code}
                          variant="outlined"
                          className="rounded-xl px-4 py-2"
                        >
                          <FormControlLabel
                            value={plan.code}
                            control={<Radio />}
                            label={
                              <div className="py-1">
                                <Typography className="font-semibold">
                                  {plan.name}
                                </Typography>
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  {plan.milestones
                                    .map((m) => {
                                      const due = weekDate(
                                        feePlan?.termStart ?? null,
                                        m.week,
                                      );
                                      const amount = total
                                        ? ` (${formatKes((total * m.percent) / 100)})`
                                        : "";
                                      return `${m.percent}%${amount} by ${due ?? `week ${m.week}`}`;
                                    })
                                    .join(" · ")}
                                </Typography>
                              </div>
                            }
                          />
                        </Paper>
                      ))}
                    </RadioGroup>
                  )}
                />
              </Grid>
            </FormSection>
          </div>
        );
      }
      case 5: {
        const values = getValues();
        const documents = [
          values.birthCertificateUrl && "Birth Certificate",
          values.reportCardUrl && "Report Card",
          values.passportPhotoUrl && "Passport Photo",
        ].filter(Boolean);

        return (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ReviewCard
              title="Student"
              onEdit={() => goToStep(0)}
              rows={[
                ["Name", `${values.firstName} ${values.lastName}`],
                ["Admission No.", values.admissionNumber],
                ["NEMIS No.", values.nemisNumber],
                ["Date of Birth", values.dob],
                ["Gender", values.gender],
                ["Previous School", values.previousSchool || "—"],
                ["Portal Email", values.studentEmail],
                [
                  "Password",
                  values.studentPassword ? "Set manually" : "Auto-generated",
                ],
              ]}
            />
            <ReviewCard
              title="Parent / Guardian"
              onEdit={() => goToStep(1)}
              rows={[
                ["Name", values.parentName],
                ["Relationship", values.parentRelationship],
                ["Phone", values.parentPhone],
                ["National ID", values.nationalId || "—"],
                ["Portal Email", values.parentEmail || "—"],
                [
                  "Password",
                  existingParent
                    ? "Existing account"
                    : values.parentPassword
                      ? "Set manually"
                      : "Auto-generated",
                ],
              ]}
            />
            <ReviewCard
              title="Class & Subjects"
              onEdit={() => goToStep(2)}
              rows={[
                [
                  "Class",
                  classes.find((c) => c.id === values.classId)?.name ||
                    values.classId,
                ],
                [
                  "Subjects",
                  <div
                    key="subjects"
                    className="flex flex-wrap justify-end gap-1"
                  >
                    {(values.subjectIds || []).map((id) => (
                      <Chip key={id} size="small" label={subjectName(id)} />
                    ))}
                  </div>,
                ],
              ]}
            />
            <ReviewCard
              title="Documents"
              onEdit={() => goToStep(3)}
              rows={[
                ["Uploaded", documents.length ? documents.join(", ") : "None"],
              ]}
            />
            <ReviewCard
              title="Fee Plan"
              onEdit={() => goToStep(4)}
              rows={[
                [
                  "Term fees",
                  feePlan?.structure
                    ? formatKes(feePlan.structure.total)
                    : "No published structure yet",
                ],
                [
                  "Plan",
                  feePlan?.plans.find((p) => p.code === values.paymentPlan)
                    ?.name || values.paymentPlan,
                ],
              ]}
            />
          </div>
        );
      }
      default:
        return null;
    }
  };

  const isLastStep = activeStep === steps.length - 1;

  return (
    <AuthGuardRedirect auth={["SUPER_ADMIN", "ADMIN"]}>
      <FusePageSimple
        content={
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
            <div>
              <Typography className="text-4xl font-extrabold tracking-tight">
                New Student Admission
              </Typography>
              <Typography color="text.secondary" className="mt-1">
                Register a student, link their parent or guardian and assign
                classes
              </Typography>
            </div>

            {submitResult && (
              <Alert
                severity={submitResult.success ? "success" : "error"}
                className="rounded-xl"
                onClose={() => setSubmitResult(null)}
              >
                {submitResult.message}
              </Alert>
            )}

            {drafts.length > 0 && (
              <Paper variant="outlined" className="rounded-2xl">
                <Box
                  className="flex items-center gap-2 px-4 py-3 sm:px-6"
                  sx={{ borderBottom: 1, borderColor: "divider" }}
                >
                  <FuseSvgIcon size={18}>lucide:file-pen-line</FuseSvgIcon>
                  <Typography className="font-semibold">
                    Unfinished admissions ({drafts.length})
                  </Typography>
                </Box>
                <ul className="flex flex-col">
                  {drafts.map((d) => (
                    <li
                      key={d.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6"
                    >
                      <div className="min-w-0">
                        <Typography className="font-medium">
                          {d.label}
                          {d.id === draftId && (
                            <Chip
                              size="small"
                              color="secondary"
                              label="Open"
                              className="ml-2"
                            />
                          )}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Stopped at {steps[Math.min(d.step, steps.length - 1)].label}{" "}
                          · saved {new Date(d.updatedAt).toLocaleString()}
                          {d.createdBy ? ` by ${d.createdBy}` : ""}
                        </Typography>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="small"
                          onClick={() => resumeDraft(d)}
                          disabled={d.id === draftId}
                        >
                          Resume
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          onClick={() => deleteDraft(d)}
                        >
                          Delete
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </Paper>
            )}

            <Paper variant="outlined" className="overflow-hidden rounded-2xl">
              <Box
                className="px-4 py-5 sm:px-8"
                sx={{ borderBottom: 1, borderColor: "divider" }}
              >
                <StepIndicator activeStep={activeStep} onStepClick={goToStep} />
              </Box>

              <div key={activeStep} className="flex flex-col gap-6 p-4 sm:p-8">
                <div>
                  <Typography className="text-2xl font-bold">
                    {steps[activeStep].title}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    className="mt-1"
                  >
                    {steps[activeStep].description}
                  </Typography>
                </div>
                {renderStepContent(activeStep)}
              </div>

              <Box
                className="flex items-center justify-between gap-4 px-4 py-4 sm:px-8"
                sx={{
                  borderTop: 1,
                  borderColor: "divider",
                  bgcolor: "background.default",
                }}
              >
                <Button
                  color="inherit"
                  disabled={
                    activeStep === 0 || !!uploadingField || isSubmitting
                  }
                  onClick={handleBack}
                  startIcon={
                    <FuseSvgIcon size={16}>lucide:arrow-left</FuseSvgIcon>
                  }
                >
                  Back
                </Button>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  className="hidden sm:block"
                >
                  Step {activeStep + 1} of {steps.length}
                </Typography>
                <div className="flex items-center gap-2">
                <Button
                  color="inherit"
                  onClick={saveDraft}
                  disabled={savingDraft || !!uploadingField || isSubmitting}
                  startIcon={
                    savingDraft ? (
                      <CircularProgress size={14} color="inherit" />
                    ) : (
                      <FuseSvgIcon size={16}>lucide:save</FuseSvgIcon>
                    )
                  }
                >
                  {draftId ? "Update draft" : "Save draft"}
                </Button>
                {isLastStep ? (
                  <Button
                    variant="contained"
                    color="secondary"
                    className="rounded-full px-6"
                    onClick={handleSubmit(onSubmit)}
                    disabled={!!uploadingField || isSubmitting}
                    startIcon={
                      isSubmitting ? (
                        <CircularProgress size={16} color="inherit" />
                      ) : (
                        <FuseSvgIcon size={16}>lucide:check</FuseSvgIcon>
                      )
                    }
                  >
                    {isSubmitting ? "Submitting…" : "Submit Admission"}
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    color="secondary"
                    className="rounded-full px-6"
                    onClick={handleNext}
                    disabled={!!uploadingField}
                    endIcon={
                      <FuseSvgIcon size={16}>lucide:arrow-right</FuseSvgIcon>
                    }
                  >
                    Continue
                  </Button>
                )}
                </div>
              </Box>
            </Paper>
          </div>
        }
      />
    </AuthGuardRedirect>
  );
}

function StepIndicator(props: {
  activeStep: number;
  onStepClick: (step: number) => void;
}) {
  const { activeStep, onStepClick } = props;

  return (
    <ol className="flex items-center">
      {steps.map((step, index) => {
        const completed = index < activeStep;
        const active = index === activeStep;

        return (
          <li
            key={step.label}
            className={`flex items-center ${index < steps.length - 1 ? "flex-1" : ""}`}
          >
            <button
              type="button"
              onClick={() => onStepClick(index)}
              disabled={!completed}
              className={`flex items-center gap-3 ${completed ? "cursor-pointer" : "cursor-default"}`}
            >
              <Box
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
                sx={{
                  borderColor:
                    completed || active ? "secondary.main" : "divider",
                  bgcolor: completed ? "secondary.main" : "transparent",
                  color: completed
                    ? "secondary.contrastText"
                    : active
                      ? "secondary.main"
                      : "text.disabled",
                }}
              >
                <FuseSvgIcon size={16}>
                  {completed ? "lucide:check" : step.icon}
                </FuseSvgIcon>
              </Box>
              <Typography
                variant="body2"
                className={`hidden text-left font-semibold whitespace-nowrap lg:block ${active ? "" : "opacity-60"}`}
              >
                {step.label}
              </Typography>
            </button>
            {index < steps.length - 1 && (
              <Box
                className="mx-3 h-0.5 flex-1 rounded-full transition-colors"
                sx={{ bgcolor: completed ? "secondary.main" : "divider" }}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function FormSection(props: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const { title, description, children } = props;

  return (
    <section className="flex flex-col gap-4">
      <div>
        <Typography
          variant="overline"
          color="text.secondary"
          className="leading-none font-semibold tracking-wider"
        >
          {title}
        </Typography>
        {description && (
          <Typography variant="body2" color="text.secondary" className="mt-1">
            {description}
          </Typography>
        )}
      </div>
      <Grid container spacing={2.5}>
        {children}
      </Grid>
    </section>
  );
}

function ReviewCard(props: {
  title: string;
  onEdit: () => void;
  rows: [string, React.ReactNode][];
}) {
  const { title, onEdit, rows } = props;

  return (
    <Paper variant="outlined" className="flex flex-col rounded-xl">
      <Box
        className="flex items-center justify-between px-4 py-3"
        sx={{ borderBottom: 1, borderColor: "divider" }}
      >
        <Typography className="font-semibold">{title}</Typography>
        <Button
          size="small"
          color="secondary"
          onClick={onEdit}
          startIcon={<FuseSvgIcon size={14}>lucide:pencil</FuseSvgIcon>}
        >
          Edit
        </Button>
      </Box>
      <dl className="flex flex-col gap-3 px-4 py-4">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4">
            <Typography
              component="dt"
              variant="body2"
              color="text.secondary"
              className="shrink-0"
            >
              {label}
            </Typography>
            <Typography
              component="dd"
              variant="body2"
              className="text-right font-medium break-all"
            >
              {value || "—"}
            </Typography>
          </div>
        ))}
      </dl>
    </Paper>
  );
}
