// SessionEnd hook stdin data types
export interface SessionEndHookData {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: string;
  hook_event_name: "SessionEnd";
  reason: "exit" | "clear" | "logout" | "prompt_input_exit" | "other";
}
