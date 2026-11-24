/**
 * Every error code the API can return, in the owner's words: what went wrong and how to fix it.
 * No "please", "sorry", "invalid" or "oops" (brief section 2). A test checks every code the API sends has a sentence.
 * In: an error code.  Out: a sentence.
 */
export const ERROR_WORDS: Record<string, string> = {
  network: "The pre-check service did not answer. Check your connection and try again in a moment.",
  plan_needed: "Choose a floor plan file, or try an example plan.",
  unknown_business_type: "Choose the kind of business from the list.",
  demo_case_not_found: "That example plan is not on this server. Choose one of the example plans on the Start page.",
  plan_reading_failed: "We could not read this plan. Upload a clearer copy, or enter the measurements yourself.",
  no_model_key: "This server cannot read uploaded plans yet. Try an example plan, or enter the measurements yourself.",
  unsupported_file_type: "The file must be a PDF, PNG or JPG.",
  empty_file: "The file is empty. Choose the file again, or a different copy of the plan.",
  file_too_large: "The file is too large. Upload a smaller copy, for example a photo instead of a scan.",
  check_not_found: "This check is no longer kept. It was deleted or it expired. Start a new check.",
  invalid_request: "Some of the answers could not be used. Check the highlighted answers and try again.",
  not_found: "The pre-check service did not recognise this request. Start again from the first step.",
  method_not_allowed: "The pre-check service did not recognise this request. Start again from the first step.",
  http_error: "The pre-check service could not handle this request. Try again in a moment.",
  server_error: "Something went wrong on the server and nothing was saved. Try again in a moment.",
  no_speech_to_text: "Speaking a question is not available on this server. Type the question instead.",
  audio_needed: "Nothing was recorded. Press Speak and say your question, or type it.",
  audio_not_wav: "The recording could not be used. Press Speak to record again, or type the question.",
  audio_too_large: "The recording is too long. Ask a shorter question, or type it.",
  speech_not_understood: "The recording could not be made out. Try again closer to the microphone, or type the question.",
  microphone_blocked: "The browser is not letting this page use the microphone. Allow it in the site settings, or type the question.",
};

export function errorWords(code: string): string {
  return ERROR_WORDS[code] ?? ERROR_WORDS.server_error;
}
