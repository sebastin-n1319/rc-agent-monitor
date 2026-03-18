/// <reference types="node" />
import { EventEmitter } from 'events';
import Cache from '../core/Cache';
export interface DiscoveryOptions {
    cache: Cache;
    cacheId: string;
    initialEndpoint: string;
    fetchGet: (url: string, query?: any, options?: any) => Promise<Response>;
    clientId: string;
    brandId?: string;
    refreshHandicapMs?: number;
    refreshDelayMs?: number;
    retryCount?: number;
    retryInterval?: number;
}
export interface ExternalDiscoveryAuthApiData {
    authorizationUri: string;
    oidcDiscoveryUri: string;
    baseUri: string;
    tokenUri: string;
}
export interface InitialDiscoveryAuthApiData {
    authorizationUri: string;
    oidcDiscoveryUri: string;
    defaultTokenUri: string;
}
export interface DiscoveryCoreApiData {
    baseUri: string;
}
export interface ExternalDiscoveryApiData {
    externalUri: string;
    initialUri: string;
}
export interface InitialDiscoveryApiData {
    defaultExternalUri: string;
}
export interface DiscoveryGlipData {
    discovery: string;
    entry: string;
}
export interface DiscoveryRcvData {
    baseWebUri: string;
    baseApiUri: string;
    pubnubOrigin: string;
}
export interface DiscoveryRcmData {
    baseWebUri: string;
    sdkDomain: string;
}
export interface DiscoveryEdcData {
    baseUri: string;
}
export interface InitialDiscoveryData {
    version: string;
    retryCount: number;
    retryInterval: number;
    discoveryApi: InitialDiscoveryApiData;
    authApi: InitialDiscoveryAuthApiData;
    coreApi: DiscoveryCoreApiData;
    rcm: DiscoveryRcmData;
    rcv: DiscoveryRcvData;
    edc?: DiscoveryEdcData;
    glip?: DiscoveryGlipData;
}
export interface ExternalDiscoveryData {
    version: string;
    tag?: string;
    expiresIn: number;
    expireTime: number;
    retryCount: number;
    retryInterval: number;
    retryCycleDelay: number;
    discoveryApi: ExternalDiscoveryApiData;
    authApi: ExternalDiscoveryAuthApiData;
    coreApi: DiscoveryCoreApiData;
    rcm: DiscoveryRcmData;
    rcv: DiscoveryRcvData;
    edc?: DiscoveryEdcData;
    glip?: DiscoveryGlipData;
}
export declare enum events {
    initialized = "initialized",
    externalDataUpdated = "externalDataUpdated",
    externalRefreshError = "externalRefreshError",
    initialFetchError = "initialFetchError"
}
export declare const DEFAULT_RETRY_COUNT = 3;
export declare const DEFAULT_RETRY_Interval = 3;
export declare const DEFAULT_RENEW_HANDICAP_MS: number;
export default class Discovery extends EventEmitter {
    events: typeof events;
    private _cache;
    private _initialCacheId;
    private _externalCacheId;
    private _fetchGet;
    private _initialEndpoint;
    private _clientId;
    private _defaultBrandId?;
    private _initialPromise?;
    private _initialFetchPromise?;
    private _externalFetchPromise?;
    private _externalRefreshPromise?;
    private _initialized;
    private _refreshHandicapMs;
    private _refreshDelayMs;
    private _initialRetryCount;
    private _initialRetryMaxCount;
    private _initialRetryInterval;
    private _externalRetryCount;
    private _externalRetryMaxCount;
    private _externalRetryInterval;
    private _externalRetryCycleTimeout?;
    constructor({ cache, cacheId, fetchGet, clientId, initialEndpoint, refreshHandicapMs, refreshDelayMs, retryCount, retryInterval, brandId, }: DiscoveryOptions);
    init(): Promise<void>;
    private _init;
    fetchInitialData(): Promise<InitialDiscoveryData>;
    private _fetchInitialData;
    private _fetchExternalData;
    fetchExternalData(externalEndpoint: string): Promise<ExternalDiscoveryData>;
    private _refreshExternalData;
    refreshExternalData(): Promise<void>;
    initialData(): Promise<InitialDiscoveryData | null>;
    externalData(): Promise<ExternalDiscoveryData | null>;
    private _setInitialData;
    private _setExternalData;
    removeExternalData(): Promise<void>;
    removeInitialData(): Promise<void>;
    /**
     * Check if there is expired
     */
    externalDataExpired(): Promise<boolean>;
    get initialized(): boolean;
    get refreshingExternalData(): boolean;
    get externalRetryCycleScheduled(): boolean;
    cancelExternalRetryCycleTimeout(): void;
    on(event: events.initialized, listener: (discoveryData: InitialDiscoveryData) => void): any;
    on(event: events.externalDataUpdated, listener: (discoveryData: ExternalDiscoveryData) => void): any;
    on(event: events.initialFetchError, listener: (e: Error) => void): any;
    on(event: events.externalRefreshError, listener: (e: Error) => void): any;
}
