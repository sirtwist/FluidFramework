// tslint:disable-next-line:no-submodule-imports
// tslint:disable-next-line:no-submodule-imports
import * as core from "@prague/routerlicious/dist/core";
// tslint:disable-next-line:no-submodule-imports
import {
    IClient,
    IDocumentDeltaConnection,
    IDocumentMessage,
    ISequencedDocumentMessage,
    IUser,
} from "@prague/runtime-definitions";
import { BatchManager } from "@prague/utils";
import { EventEmitter } from "events";

import {
    TestWebSocketServer,
// tslint:disable-next-line:no-submodule-imports
} from "@prague/routerlicious/dist/test/testUtils";

import { debug, IConnect, IConnected } from "@prague/socket-storage-shared";

export class TestDocumentDeltaConnection extends EventEmitter implements IDocumentDeltaConnection {

    public static async Create(
        tenantId: string,
        id: string,
        token: string,
        client: IClient,
        webSocketServer: core.IWebSocketServer): Promise<IDocumentDeltaConnection> {
        const socket = (webSocketServer as TestWebSocketServer).createConnection();

        const connectMessage: IConnect = {
            client,
            id,
            tenantId,
            token,  // token is going to indicate tenant level information, etc...
        };

        const connection = await new Promise<IConnected>((resolve, reject) => {
            // Listen for ops sent before we receive a response to connect_document
            const queuedMessages: ISequencedDocumentMessage[] = [];

            const earlyOpHandler = (documentId: string, msgs: ISequencedDocumentMessage[]) => {
                debug("Queued early ops", msgs.length);
                queuedMessages.push(...msgs);
            };
            socket.on("op", earlyOpHandler);

            // Listen for connection issues
            socket.on("connect_error", (error) => {
                reject(error);
            });

            socket.on("connect_document_success", (response: IConnected) => {
                socket.removeListener("op", earlyOpHandler);

                if (queuedMessages.length > 0) {
                    // some messages were queued.
                    // add them to the list of initialMessages to be processed
                    if (!response.initialMessages) {
                        response.initialMessages = [];
                    }

                    response.initialMessages.push(...queuedMessages);

                    response.initialMessages.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
                }

                resolve(response);
            });

            socket.on("connect_document_error", reject);

            socket.emit("connect_document", connectMessage);
        });

        const deltaConnection = new TestDocumentDeltaConnection(socket, id, connection);

        return Promise.resolve(deltaConnection);
    }

    private emitter = new EventEmitter();
    private submitManager: BatchManager<IDocumentMessage>;

    public get clientId(): string {
        return this.details.clientId;
    }

    public get existing(): boolean {
        return this.details.existing;
    }

    public get parentBranch(): string {
        return this.details.parentBranch;
    }

    public get maxMessageSize(): number {
        return this.details.maxMessageSize;
    }

    public get user(): IUser {
        return this.details.user;
    }

    public get initialMessages(): ISequencedDocumentMessage[] {
        return this.details.initialMessages;
    }

    constructor(
        private socket: core.IWebSocket,
        public documentId: string,
        public details: IConnected) {
        super();

        this.submitManager = new BatchManager<IDocumentMessage>((submitType, work) => {
            this.socket.emit(
                submitType,
                this.details.clientId,
                work,
                (error) => {
                    if (error) {
                        debug("Emit error", error);
                    }
                });
        });
    }

    /**
     * Subscribe to events emitted by the document
     */
    public on(event: string, listener: (...args: any[]) => void): this {
        // Register for the event on socket.io
        this.socket.on(
            event,
            (...args: any[]) => {
                this.emitter.emit(event, ...args);
            });

        // And then add the listener to our event emitter
        this.emitter.on(event, listener);

        return this;
    }

    /**
     * Submits a new delta operation to the server
     */
    public submit(message: IDocumentMessage): void {
        this.submitManager.add("submitOp", message);
    }

    public disconnect() {
        // Do nothing
    }
}
