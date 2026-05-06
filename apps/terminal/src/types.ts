// Service-line codes are now dynamic (managed from the admin Service Lines
// page); we keep the alias for documentation but treat it as plain string.
export type ServiceLine = string;

export type TerminalConfig = {
  branch_id: string;
  branch_name: string;
  service_line: ServiceLine;
  staff_token: string;     // JWT for the front-desk user signed into this terminal
  staff_name: string;
};
