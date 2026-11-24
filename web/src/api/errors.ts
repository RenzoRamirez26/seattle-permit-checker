/**
 * Every error code the API can return, in the owner's words: what went wrong and how to fix it.
 * Written to CONTENT.md: no blame words, no "please", "sorry", "invalid" or "oops". A test checks every code the API sends has a sentence.
 * In: an error code.  Out: a sentence.
 */
export const ERROR_WORDS: Record<string, string> = {
  network: "The pre-check service didn't answer. Check your connection, then try again in a moment.",
  plan_needed: "Choose a floor plan file, or try an example plan.",
  unknown_business_type: "Choose the kind of business from the list.",
  demo_case_not_found: "That example plan isn't on this server. Choose another example plan on step 2.",
  plan_reading_failed: "We couldn't read this plan. Upload a clearer scan or photo, or enter the readings by hand.",
  no_model_key: "This server can't read uploaded plans yet. Try an example plan, or enter the measurements yourself.",
  unsupported_file_type: "We can’t read this kind of file. Upload a PDF, PNG or JPG.",
  empty_file: "The file is empty. Choose it again, or choose another copy of the plan.",
  file_too_large: "The file is over the upload limit. Upload a smaller copy, for example a photo instead of a scan.",
  check_not_found: "This check is no longer kept. It was deleted or it expired. Start a new check.",
  invalid_request: "Some answers couldn't be used. Check the marked answers, then try again.",
  not_found: "The pre-check service didn't recognise this request. Start over from step 1.",
  method_not_allowed: "The pre-check service didn't recognise this request. Start over from step 1.",
  http_error: "The pre-check service couldn't handle this request. Try again in a moment.",
  server_error: "Something went wrong on the server and nothing was saved. Try again in a moment.",
  no_speech_to_text: "This server can't take spoken questions. Type the question instead.",
  audio_needed: "Nothing was recorded. Press Speak and say your question, or type it.",
  audio_not_wav: "The recording couldn't be used. Press Speak to record again, or type the question.",
  audio_too_large: "The recording is over the time limit. Ask a shorter question, or type it.",
  speech_not_understood: "The recording could not be made out. Try again closer to the microphone, or type the question.",
  microphone_blocked: "The browser isn't letting this page use the microphone. Allow it in the site settings, or type the question.",
};

export function errorWords(code: string): string {
  return ERROR_WORDS[code] ?? ERROR_WORDS.server_error;
}
