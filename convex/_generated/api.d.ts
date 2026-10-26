/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as SmtpEmail from "../SmtpEmail.js";
import type * as actionLogs from "../actionLogs.js";
import type * as asana from "../asana.js";
import type * as auth from "../auth.js";
import type * as constants from "../constants.js";
import type * as contentDiff from "../contentDiff.js";
import type * as credentialSync from "../credentialSync.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as httpAuth from "../httpAuth.js";
import type * as phpVersions from "../phpVersions.js";
import type * as pluginActions from "../pluginActions.js";
import type * as rocketAccounts from "../rocketAccounts.js";
import type * as seedTestUser from "../seedTestUser.js";
import type * as settings from "../settings.js";
import type * as siteMuPlugins from "../siteMuPlugins.js";
import type * as sitePlugins from "../sitePlugins.js";
import type * as sites from "../sites.js";
import type * as smtp from "../smtp.js";
import type * as ssoAuth from "../ssoAuth.js";
import type * as stagingManage from "../stagingManage.js";
import type * as sync from "../sync.js";
import type * as syncAlerts from "../syncAlerts.js";
import type * as testAuth from "../testAuth.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  SmtpEmail: typeof SmtpEmail;
  actionLogs: typeof actionLogs;
  asana: typeof asana;
  auth: typeof auth;
  constants: typeof constants;
  contentDiff: typeof contentDiff;
  credentialSync: typeof credentialSync;
  crons: typeof crons;
  http: typeof http;
  httpAuth: typeof httpAuth;
  phpVersions: typeof phpVersions;
  pluginActions: typeof pluginActions;
  rocketAccounts: typeof rocketAccounts;
  seedTestUser: typeof seedTestUser;
  settings: typeof settings;
  siteMuPlugins: typeof siteMuPlugins;
  sitePlugins: typeof sitePlugins;
  sites: typeof sites;
  smtp: typeof smtp;
  ssoAuth: typeof ssoAuth;
  stagingManage: typeof stagingManage;
  sync: typeof sync;
  syncAlerts: typeof syncAlerts;
  testAuth: typeof testAuth;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
