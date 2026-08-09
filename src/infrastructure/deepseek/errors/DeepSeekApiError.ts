export class DeepSeekApiError extends Error {
  public status: number;
  public code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "DeepSeekApiError";
    this.status = status;
    this.code = code;
  }
}
