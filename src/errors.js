import ExtendableError from 'es6-error';

export class ExpiredError extends ExtendableError {}

export class AuthenticationFailedError extends ExtendableError {}

export class ReadOnlyError extends ExtendableError {}

export class InvalidStateError extends ExtendableError {}
