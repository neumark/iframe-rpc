import MiniIframeRPC from 'mini-iframe-rpc';
import testBase from './test-base';

describe('mini-iframe-rpc', function() {
    window.isParent = "parent";

    beforeEach((done) => {
        window.parentRPC = new MiniIframeRPC({'defaultInvocationOptions': {'timeout': 0, 'retryLimit': 0}});
        testBase.defaultBeforeEach({done, parentRPC: window.parentRPC});
    });

    afterEach((done) => {
        testBase.defaultAfterEach({done, parentRPC: window.parentRPC});
    });

    it('can invoke registered procedures (parent calling child)', function(done) {
        testBase.ready.then((child) => {
            testBase.onScriptRun('childRPC.register("callme", function() {return window.isChild;});').then(() => 
                parentRPC.invoke(child, null, "callme").then((result) => {
                    expect(result).toBe("child");
                    done();
                })
            );
        });
    });

    it('can invoke registered procedures (child calling parent)', function(done) {
        testBase.ready.then(() => {
            parentRPC.register('callme', (callerName) => {
                expect(window.isParent).toBe("parent");
                expect(callerName).toBe("child");
                done();
            });
            testBase.runChildScript(`childRPC.invoke(window.parent, null, "callme", [window.isChild])`);
        });
    });

    it('can properly pass complex arguments', function(done) {
        testBase.ready.then((child) => testBase.onScriptRun(`
            var recursiveReduce = function (fn, args) {
                return args.map(function(arg) {
                    if (arg instanceof Array) {
                        return recursiveReduce(fn, arg);
                    }
                    return arg;
                }).reduce(fn);
            };
            window.childRPC.register("add", function (input) {return recursiveReduce(function(a,b) {return a+b;}, input);}); 
            `)
        ).then(() => parentRPC.invoke(testBase.childWindow(), null, "add", [[1,2,[1,2,3],4,5]])
        ).then((result) => {
            expect(result).toBe(18);
            done();
        });
    });

    it('can properly pass complex arguments not wrapped in array', function(done) {
        testBase.ready.then((child) => testBase.onScriptRun(`
            window.childRPC.register("add", function (input) {
                var acc = 0;
                for (var i in input) {
                    if (input.hasOwnProperty(i)) {
                        acc += input[i];
                    }
                }
                return acc;
            }); 
            `)
        ).then(() => parentRPC.invoke(testBase.childWindow(), null, "add", {"a": 1, "b": 2, "c": 3})
        ).then((result) => {
            expect(result).toBe(6);
            done();
        });
    });


    it('can return complex parameters', function(done) {
        const obj = {"a": 1, "b": [1,2,3], "c": false};
        testBase.ready.then((child) => {
            testBase.onScriptRun(`
                window.childRPC.register('callme', function() {
                    return ${JSON.stringify(obj)};
                });
            `
            ).then(() => parentRPC.invoke(child, null, "callme")
            ).then((result) => {
                expect(result).toEqual(obj);
                done();
            });
        });
    });

    it('can handle promise responses', function(done) {
        testBase.ready.then((child) => {
            testBase.onScriptRun(`window.childRPC.register('callme', function() {return Promise.resolve(true);});`
            ).then(() => parentRPC.invoke(child, null, "callme")
            ).then((result) => {
                expect(result).toBe(true);
                done();
            });
        });
    });

    it('rejects response promise if called function doesnt exist', function(done) {
        testBase.ready.then((child) => {
            parentRPC.invoke(child, null, "unregistered_function").then(
                (result) => done(new Error('Promise should not be resolved')),
                (reject) => {
                    expect(reject.cause.message).toEqual("Remote procedure 'unregistered_function' not registered in remote RPC instance.");
                    expect(reject.cause.name).toEqual("ProcedureNotFoundError");
                    done();
                });
        });
    });

    it('unregisters a procedure when reregistered with null implementation ', function(done) {
        testBase.ready.then(
            (child) => testBase.onScriptRun('childRPC.register("callmeX", function() {return window.isChild;});')
            // first call OK, because procedure is registered
        ).then(() => parentRPC.invoke(testBase.childWindow(), null, "callmeX")
        ).then((result) => expect(result).toEqual('child')
        ).then(() => testBase.onScriptRun('childRPC.register("callmeX", null);')
        ).then(() => parentRPC.invoke(testBase.childWindow(), null, "callmeX")
        ).then(
            (result) => done(new Error('Promise should not be resolved (result: '+result+')')),
            (reject) => {
                expect(reject.name).toEqual('InvocationError');
                expect(reject.procedureName).toEqual('callmeX');
                expect(reject.cause.name).toEqual("ProcedureNotFoundError");
                expect(reject.cause.message).toEqual("Remote procedure 'callmeX' not registered in remote RPC instance.");
                done();
            });
    });

    it('does not receive messages after close() called', function(done) {
        testBase.ready.then((child) => 
            testBase.onScriptRun('childRPC.register("callmeCloseTest", function() {return window.isChild;});')
            // first call OK, because procedure is registered
        ).then(() => parentRPC.invoke(testBase.childWindow(), null, "callmeCloseTest", [], {'timeout': 100})
        ).then((result) => expect(result).toEqual('child')
        ).then(() => parentRPC.invoke(testBase.childWindow(), null, 'close')
            // after child RPC closed, same call results in timeout
        ).then(() => parentRPC.invoke(testBase.childWindow(), null, "callmeCloseTest", [], {'timeout': 100})
        ).then(
            (result) => done(new Error('Promise should not be resolved')),
            (reject) => {
                expect(reject.name).toEqual('InvocationError');
                expect(reject.procedureName).toEqual('callmeCloseTest');
                expect(reject.cause.name).toEqual('TimeoutError');
                expect(reject.cause.message).toEqual('Timeout after 100 ms.');
                done();
            }
        );
    });

    it('gracefully handles exceptions in remote procedure', function(done) {
        testBase.ready.then(
            () => testBase.onScriptRun(`childRPC.register("err", function () {
                throw new Error("err");
            });`)
        ).then(() => parentRPC.invoke(testBase.childWindow(), null, "err")
        ).then(
            (result) => done(new Error('Promise should not be resolved')),
            (reject) => {
                expect(reject.name).toEqual('InvocationError');
                expect(reject.cause.name).toEqual('EvaluationError');
                expect(reject.cause.cause.name).toEqual('Error');
                expect(reject.cause.message).toEqual('err');
                done();
            });
    });

    it('gracefully handles rejected promise in remote procedure', function(done) {
        testBase.ready.then(
            () => testBase.onScriptRun(`childRPC.register("err", function () {return  Promise.reject("rejectionReason");});`)
        ).then(() => parentRPC.invoke(testBase.childWindow(), null, "err")
        ).then(
            (result) => done(new Error('Promise should not be resolved')),
            (reject) => {
                expect(reject.name).toEqual('InvocationError');
                expect(reject.cause).toEqual("rejectionReason");
                done();
            });
    });

    it('gracefully handles unserializable response objects', function(done) {
        testBase.ready.then(() =>
            testBase.onScriptRun(`childRPC.register("err", function() {return window;});`)
        ).then(() => parentRPC.invoke(testBase.childWindow(), null, "err")
        ).then(
            (result) => done(new Error('Promise should not be resolved')),
            (reject) => {
                expect(reject.cause.name).toBe('SendMessageError');
                done();
            });
    });

    it('gracefully handles unserializable request objects', function(done) {
        testBase.ready.then(
            () => testBase.onScriptRun(`childRPC.register("callme", function() {return true;});`)
        ).then(() => parentRPC.invoke(testBase.childWindow(), null, "callme", [window])
        ).then(
            (result) => done(new Error('Promise should not be resolved')),
            (reject) => {
                // MSIE stringifies JSON -> issues TypeError here
                expect(['DataCloneError', 'TypeError']).toContain(reject.cause.name);
                done();
            });
    });

    it('gracefully handles timeouts in remote procedure', function(done) {
        testBase.ready.then(
            () => {
                testBase.onScriptRun(`
                    childRPC.register("err", function() {
                        return new Promise(function() {return true;});
                    });`
                );
            }
        ).then(() => parentRPC.invoke(testBase.childWindow(), null, "err", [], {'timeout': 100})
        ).then(
            (result) => done(new Error('Promise should not be resolved')),
            (reject) => {
                expect(reject.procedureName).toEqual("err");
                expect(reject.cause.name).toEqual('TimeoutError');
                expect(reject.cause.message).toEqual("Timeout after 100 ms.");
                done();
            });
    });

    it('can invoke function registered in the same RPC instance', function(done) {
        testBase.ready.then(() => {
            window.parentRPC.register('finishTest', () =>  {
                done();
            });
            return testBase.onScriptRun(`
                    childRPC.register("callme", function () {
                        // ignore errors on invoke
                        return window.childRPC.invoke(window.parent, null, 'finishTest').then(
                            undefined,
                            function() {return 0;}
                        );
                    });
                    childRPC.invoke(window, null, "callme");
                `);
        });
    });
});
