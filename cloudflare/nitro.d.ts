declare module '*.mjs' {
  const application: {
    fetch(request: Request, environment: unknown, context: ExecutionContext): Promise<Response>
  }
  export default application
}
