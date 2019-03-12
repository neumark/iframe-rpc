import {MiniIframeError} from './mini-iframe-error';

export class TimeoutError extends MiniIframeError {

    procedureName = "unknown";
    timeoutMilliSeconds = -1;

    constructor(state: Partial<TimeoutError>) {
        super(`Timeout waiting for RPC response to invocation of "${state.procedureName}" after ${state.timeoutMilliSeconds} ms`);
        Object.assign(this, state);
        
        // see: typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html
        Object.setPrototypeOf(this, new.target.prototype); // restore prototype chain
        this.name = TimeoutError.name; // stack traces display correctly now                 
    }
}