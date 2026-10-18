export class BusinessError extends Error {
  constructor(public code: string, message: string, public httpStatus = 409, public blocked = false) { super(message); }
}
