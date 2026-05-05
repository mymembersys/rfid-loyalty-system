export type ServiceLine = "diagnostic" | "psychological" | "gym";

export type TerminalConfig = {
  branch_id: string;
  branch_name: string;
  service_line: ServiceLine;
  staff_token: string;     // JWT for the front-desk user signed into this terminal
  staff_name: string;
};
