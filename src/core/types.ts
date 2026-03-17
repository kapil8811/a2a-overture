// A2A Protocol Types — Based on A2A v1.0 Specification
// https://a2a-protocol.org/latest/specification/

// ─── Enums ───────────────────────────────────────────────

export enum TaskState {
  UNSPECIFIED = 'TASK_STATE_UNSPECIFIED',
  SUBMITTED = 'TASK_STATE_SUBMITTED',
  WORKING = 'TASK_STATE_WORKING',
  COMPLETED = 'TASK_STATE_COMPLETED',
  FAILED = 'TASK_STATE_FAILED',
  CANCELED = 'TASK_STATE_CANCELED',
  INPUT_REQUIRED = 'TASK_STATE_INPUT_REQUIRED',
  REJECTED = 'TASK_STATE_REJECTED',
  AUTH_REQUIRED = 'TASK_STATE_AUTH_REQUIRED',
}

export enum Role {
  UNSPECIFIED = 'ROLE_UNSPECIFIED',
  USER = 'ROLE_USER',
  AGENT = 'ROLE_AGENT',
}

// ─── Parts ───────────────────────────────────────────────

export interface Part {
  text?: string;
  raw?: string; // base64
  url?: string;
  data?: unknown;
  metadata?: Record<string, unknown>;
  filename?: string;
  mediaType?: string;
}

// ─── Messages ────────────────────────────────────────────

export interface Message {
  messageId: string;
  contextId?: string;
  taskId?: string;
  role: Role;
  parts: Part[];
  metadata?: Record<string, unknown>;
  extensions?: string[];
  referenceTaskIds?: string[];
}

// ─── Tasks ───────────────────────────────────────────────

export interface TaskStatus {
  state: TaskState;
  message?: Message;
  timestamp?: string;
}

export interface Artifact {
  artifactId: string;
  name?: string;
  description?: string;
  parts: Part[];
  metadata?: Record<string, unknown>;
  extensions?: string[];
}

export interface Task {
  id: string;
  contextId?: string;
  status: TaskStatus;
  artifacts?: Artifact[];
  history?: Message[];
  metadata?: Record<string, unknown>;
}

// ─── Streaming Events ────────────────────────────────────

export interface TaskStatusUpdateEvent {
  taskId: string;
  contextId: string;
  status: TaskStatus;
  metadata?: Record<string, unknown>;
}

export interface TaskArtifactUpdateEvent {
  taskId: string;
  contextId: string;
  artifact: Artifact;
  append?: boolean;
  lastChunk?: boolean;
  metadata?: Record<string, unknown>;
}

export interface StreamResponse {
  task?: Task;
  message?: Message;
  statusUpdate?: TaskStatusUpdateEvent;
  artifactUpdate?: TaskArtifactUpdateEvent;
}

// ─── Push Notifications ──────────────────────────────────

export interface AuthenticationInfo {
  scheme: string;
  credentials?: string;
}

export interface PushNotificationConfig {
  id?: string;
  taskId?: string;
  url: string;
  token?: string;
  authentication?: AuthenticationInfo;
}

// ─── Agent Card ──────────────────────────────────────────

export interface AgentProvider {
  url: string;
  organization: string;
}

export interface AgentCapabilities {
  streaming?: boolean;
  pushNotifications?: boolean;
  extensions?: AgentExtension[];
  extendedAgentCard?: boolean;
}

export interface AgentExtension {
  uri?: string;
  description?: string;
  required?: boolean;
  params?: Record<string, unknown>;
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
  securityRequirements?: SecurityRequirement[];
}

export interface AgentInterface {
  url: string;
  protocolBinding: string;
  tenant?: string;
  protocolVersion: string;
}

export interface AgentCardSignature {
  protected: string;
  signature: string;
  header?: Record<string, unknown>;
}

// Security schemes
export interface APIKeySecurityScheme {
  description?: string;
  location: string;
  name: string;
}

export interface HTTPAuthSecurityScheme {
  description?: string;
  scheme: string;
  bearerFormat?: string;
}

export interface OAuth2SecurityScheme {
  description?: string;
  flows: OAuthFlows;
  oauth2MetadataUrl?: string;
}

export interface OpenIdConnectSecurityScheme {
  description?: string;
  openIdConnectUrl: string;
}

export interface MutualTlsSecurityScheme {
  description?: string;
}

export interface SecurityScheme {
  apiKeySecurityScheme?: APIKeySecurityScheme;
  httpAuthSecurityScheme?: HTTPAuthSecurityScheme;
  oauth2SecurityScheme?: OAuth2SecurityScheme;
  openIdConnectSecurityScheme?: OpenIdConnectSecurityScheme;
  mtlsSecurityScheme?: MutualTlsSecurityScheme;
}

export type SecurityRequirement = Record<string, string[]>;

export interface OAuthFlows {
  authorizationCode?: AuthorizationCodeOAuthFlow;
  clientCredentials?: ClientCredentialsOAuthFlow;
  implicit?: ImplicitOAuthFlow;
  password?: PasswordOAuthFlow;
  deviceCode?: DeviceCodeOAuthFlow;
}

export interface AuthorizationCodeOAuthFlow {
  authorizationUrl: string;
  tokenUrl: string;
  refreshUrl?: string;
  scopes: Record<string, string>;
  pkceRequired?: boolean;
}

export interface ClientCredentialsOAuthFlow {
  tokenUrl: string;
  refreshUrl?: string;
  scopes: Record<string, string>;
}

export interface ImplicitOAuthFlow {
  authorizationUrl: string;
  refreshUrl?: string;
  scopes: Record<string, string>;
}

export interface PasswordOAuthFlow {
  tokenUrl: string;
  refreshUrl?: string;
  scopes: Record<string, string>;
}

export interface DeviceCodeOAuthFlow {
  deviceAuthorizationUrl: string;
  tokenUrl: string;
  refreshUrl?: string;
  scopes: Record<string, string>;
}

export interface AgentCard {
  name: string;
  description: string;
  supportedInterfaces: AgentInterface[];
  provider?: AgentProvider;
  version: string;
  documentationUrl?: string;
  capabilities: AgentCapabilities;
  securitySchemes?: Record<string, SecurityScheme>;
  securityRequirements?: SecurityRequirement[];
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: AgentSkill[];
  signatures?: AgentCardSignature[];
  iconUrl?: string;
}

// ─── Request/Response Types ──────────────────────────────

export interface SendMessageConfiguration {
  acceptedOutputModes?: string[];
  taskPushNotificationConfig?: PushNotificationConfig;
  historyLength?: number;
  returnImmediately?: boolean;
}

export interface SendMessageRequest {
  message: Message;
  configuration?: SendMessageConfiguration;
  metadata?: Record<string, unknown>;
}

export interface SendMessageResponse {
  task?: Task;
  message?: Message;
}

export interface GetTaskRequest {
  id: string;
  historyLength?: number;
}

export interface ListTasksRequest {
  contextId?: string;
  status?: TaskState;
  pageSize?: number;
  pageToken?: string;
  historyLength?: number;
  statusTimestampAfter?: string;
  includeArtifacts?: boolean;
}

export interface ListTasksResponse {
  tasks: Task[];
  nextPageToken: string;
  pageSize: number;
  totalSize: number;
}

export interface CancelTaskRequest {
  id: string;
  metadata?: Record<string, unknown>;
}

// ─── Subscribe to Task ───────────────────────────────────

export interface SubscribeToTaskRequest {
  id: string;
  historyLength?: number;
  metadata?: Record<string, unknown>;
}

// ─── Push Notification CRUD ──────────────────────────────

export interface SetPushNotificationConfigRequest {
  taskId: string;
  pushNotificationConfig: PushNotificationConfig;
}

export interface GetPushNotificationConfigRequest {
  taskId: string;
}

export interface DeletePushNotificationConfigRequest {
  taskId: string;
}

// ─── JSON-RPC Types ──────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcSuccessResponse {
  jsonrpc: '2.0';
  id: string | number;
  result: unknown;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  error: JsonRpcError;
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

// ─── A2A Error Codes (JSON-RPC) ──────────────────────────

export const A2AErrorCodes = {
  TASK_NOT_FOUND: -32001,
  TASK_NOT_CANCELABLE: -32002,
  PUSH_NOTIFICATION_NOT_SUPPORTED: -32003,
  UNSUPPORTED_OPERATION: -32004,
  CONTENT_TYPE_NOT_SUPPORTED: -32005,
  INVALID_AGENT_RESPONSE: -32006,
  EXTENDED_AGENT_CARD_NOT_CONFIGURED: -32007,
  EXTENSION_SUPPORT_REQUIRED: -32008,
  VERSION_NOT_SUPPORTED: -32009,
} as const;

// ─── Compliance / Reporting Types ────────────────────────

export type TestSeverity = 'error' | 'warning' | 'info';
export type TestResult = 'pass' | 'fail' | 'skip' | 'warn';

export interface ComplianceTestResult {
  id: string;
  name: string;
  description: string;
  result: TestResult;
  severity: TestSeverity;
  message?: string;
  details?: string;
  duration?: number;
}

export interface ComplianceReport {
  agentUrl: string;
  agentName?: string;
  protocolVersion: string;
  timestamp: string;
  duration: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    skipped: number;
  };
  tests: ComplianceTestResult[];
}
