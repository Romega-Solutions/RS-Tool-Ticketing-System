// Typed client for the self-hosted n8n "Romega ATS — Resume Extractor (Regex, No API Key)"
// workflow. No external AI API keys needed — extraction is pure regex inside n8n.
//
// Workflow JSON: n8n/Romega ATS — Resume Extractor (Regex, No API Key).json
// Form trigger fields: "Resume File" (file, required, PDF only), "Candidate ID" (text, optional).
// PDF only: DOCX text extraction needs node modules (zlib / jszip / adm-zip) that the
// n8n Code sandbox blocks by default. To allow DOCX, set
//   NODE_FUNCTION_ALLOW_EXTERNAL=jszip
// in your n8n container env and restart, then update the workflow + this client.
//
// The workflow MUST be configured with `responseMode: 'responseNode'` on its
// Form Trigger, with a "Respond to Webhook" node returning the parsed JSON.
// The shipped JSON in this repo already has that wiring.

export type ParsedExperience = {
  company:     string | null;
  title:       string | null;
  start_date:  string | null;
  end_date:    string | null;
  description: string | null;
};

export type ParsedEducation = {
  institution:     string | null;
  degree:          string | null;
  field:           string | null;
  graduation_year: string | null;
};

export type ParsedResume = {
  full_name:      string | null;
  email:          string | null;
  phone:          string | null;
  location:       string | null;
  linkedin:       string | null;
  website:        string | null;
  summary:        string | null;
  skills:         string[];
  experience:     ParsedExperience[];
  education:      ParsedEducation[];
  certifications: string[];
  languages:      string[];
};

export type ResumeParseSuccess = {
  success: true;
  data:    ParsedResume;
};

export type ResumeParseFailure = {
  success: false;
  error:   string;
  code:    string;
};

export type ResumeParseResult = ResumeParseSuccess | ResumeParseFailure;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // matches the n8n validator's 10 MB cap

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
]);

export function getResumeParserUrl(): string {
  const url = process.env.N8N_RESUME_PARSER_URL;
  if (!url) {
    throw new Error('N8N_RESUME_PARSER_URL is not configured. Add it to .env.');
  }
  return url;
}

export async function parseResumeWithN8n(
  file: File,
  candidateId?: string | number,
): Promise<ResumeParseResult> {
  if (!file || file.size === 0) {
    return { success: false, code: 'EMPTY_FILE', error: 'No file provided.' };
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      success: false,
      code: 'FILE_TOO_LARGE',
      error: `${(file.size / 1024 / 1024).toFixed(1)} MB exceeds the 10 MB limit.`,
    };
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return {
      success: false,
      code: 'INVALID_FILE_TYPE',
      error: file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ? 'Word documents are not supported yet. Save your resume as PDF and try again.'
        : `Got "${file.type || 'unknown'}". Only PDF is accepted.`,
    };
  }

  const url = getResumeParserUrl();

  // n8n's Form Trigger names binary keys after the visible field labels.
  // The regex workflow uses "Resume File" and "Candidate ID" (with the space).
  const body = new FormData();
  body.append('Resume File', file, file.name);
  if (candidateId !== undefined && candidateId !== null) {
    body.append('Candidate ID', String(candidateId));
  }

  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', body });
  } catch (err) {
    return {
      success: false,
      code: 'NETWORK_ERROR',
      error: `Could not reach n8n: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return {
      success: false,
      code: 'INVALID_RESPONSE',
      error: `n8n returned non-JSON (status ${res.status}).`,
    };
  }

  const p = payload as {
    success?: boolean;
    error?:   string;
    code?:    string;
    data?:    Partial<ParsedResume>;
  };

  if (!p.success) {
    return {
      success: false,
      code: (p.code ?? 'UNKNOWN_ERROR').trim(),
      error: (p.error ?? `n8n responded with ${res.status}`).trim(),
    };
  }

  return { success: true, data: normalize(p.data ?? {}) };
}

function normalize(d: Partial<ParsedResume>): ParsedResume {
  return {
    full_name:      d.full_name      ?? null,
    email:          d.email          ?? null,
    phone:          d.phone          ?? null,
    location:       d.location       ?? null,
    linkedin:       d.linkedin       ?? null,
    website:        d.website        ?? null,
    summary:        d.summary        ?? null,
    skills:         Array.isArray(d.skills)         ? d.skills.filter(Boolean) as string[] : [],
    experience:     Array.isArray(d.experience)     ? (d.experience as ParsedExperience[]) : [],
    education:      Array.isArray(d.education)      ? (d.education as ParsedEducation[])   : [],
    certifications: Array.isArray(d.certifications) ? d.certifications.filter(Boolean) as string[] : [],
    languages:      Array.isArray(d.languages)      ? d.languages.filter(Boolean) as string[] : [],
  };
}
