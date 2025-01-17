/* eslint-disable dot-notation */
/* eslint-disable no-underscore-dangle */
import SDKConnector from '../SDKConnector';
import {ISDKConnector, WebexSDK} from '../SDKConnector/types';
import {ALLOWED_SERVICES, HTTP_METHODS, WebexRequestPayload, SORT, SORT_BY} from '../common/types';
import {ICallHistory, JanusResponseEvent, LoggerInterface} from './types';
import log from '../Logger';
import {serviceErrorCodeHandler} from '../common/Utils';
import {CALL_HISTORY_FILE, FROM_DATE, HISTORY, LIMIT, NUMBER_OF_DAYS} from './constants';
import {STATUS_CODE, SUCCESS_MESSAGE, USER_SESSIONS} from '../common/constants';
import {
  COMMON_EVENT_KEYS,
  CallHistoryEventTypes,
  CallSessionEvent,
  MOBIUS_EVENT_KEYS,
  UserSession,
} from '../Events/types';
import {Eventing} from '../Events/impl';
/**
 * `CallHistory` module is designed to facilitate the retrieval of Call History Records by providing a set of APIs.
 *
 * This code snippet demonstrates how to create an instance of `CallHistory` using webex and logger.
 *
 * Example
 * ```javascript
 * const callHistory = createCallHistoryClient(webex, logger);
 * ```
 *
 * @implements {ICallHistory}
 */
export class CallHistory extends Eventing<CallHistoryEventTypes> implements ICallHistory {
  private sdkConnector: ISDKConnector;

  private webex: WebexSDK;

  private janusUrl = '';

  private fromDate = '';

  private loggerContext = {
    file: CALL_HISTORY_FILE,
    method: 'getCallHistoryData',
  };

  private userSessions: UserSession[] | undefined;

  /**
   * @ignore
   */
  constructor(webex: WebexSDK, logger: LoggerInterface) {
    super();
    this.sdkConnector = SDKConnector;
    if (!this.sdkConnector.getWebex()) {
      SDKConnector.setWebex(webex);
    }
    this.webex = this.sdkConnector.getWebex();
    this.janusUrl = this.webex.internal.services._serviceUrls.janus;
    this.registerSessionsListener();
    log.setLogger(logger.level, CALL_HISTORY_FILE);
  }

  /**
   * Function to display the Janus API response.
   * @param days - Number of days to fetch the call history data.
   * @param limit - Number of records to be fetched.
   * @param sort - Sort the records in ascending or descending order.
   * @param sortBy - Sort the records by start time or end time.
   */
  public async getCallHistoryData(
    days: number = NUMBER_OF_DAYS,
    limit: number = LIMIT,
    sort: SORT = SORT.DEFAULT,
    sortBy: SORT_BY = SORT_BY.DEFAULT
  ): Promise<JanusResponseEvent> {
    /*
      1. Mandatory field for Janus API - fromDate
      2. Calculating the fromDate by deducting the NUMBER_OF_DAYS with the current date
     */
    const date = new Date();

    date.setDate(date.getDate() - days);
    this.fromDate = date.toISOString();
    const sortByParam = Object.values(SORT_BY).includes(sortBy) ? sortBy : SORT_BY.DEFAULT;
    const sortParam = Object.values(SORT).includes(sort) ? sort : SORT.DEFAULT;

    log.log(`Janus API URL ${this.janusUrl}`, this.loggerContext);
    log.info(`Call history from date : ${this.fromDate}`, this.loggerContext);
    log.info(`Call history sort type : ${sortParam}`, this.loggerContext);
    log.info(`Call history sortby type : ${sortByParam}`, this.loggerContext);
    const url = `${this.janusUrl}/${HISTORY}/${USER_SESSIONS}${FROM_DATE}=${this.fromDate}&limit=${limit}&includeNewSessionTypes=true&sort=${sortParam}`;

    try {
      const janusResponse = <WebexRequestPayload>await this.webex.request({
        uri: `${url}`,
        method: HTTP_METHODS.GET,
        service: ALLOWED_SERVICES.JANUS,
      });

      this.userSessions = janusResponse.body as UserSession[];
      if (sortByParam === SORT_BY.START_TIME) {
        if (sortParam === SORT.DESC) {
          this.userSessions[USER_SESSIONS].sort(
            (element: Date, compareElement: Date) =>
              new Date(compareElement[sortByParam]).getTime() -
              new Date(element[sortByParam]).getTime()
          );
        } else if (sortParam === SORT.ASC) {
          this.userSessions[USER_SESSIONS].sort(
            (element: Date, compareElement: Date) =>
              new Date(element[sortByParam]).getTime() -
              new Date(compareElement[sortByParam]).getTime()
          );
        }
      }
      const responseDetails = {
        statusCode: this.userSessions[STATUS_CODE],
        data: {
          userSessions: this.userSessions[USER_SESSIONS],
        },
        message: SUCCESS_MESSAGE,
      };

      return responseDetails;
    } catch (err: unknown) {
      const errorInfo = err as WebexRequestPayload;
      const errorStatus = serviceErrorCodeHandler(errorInfo, this.loggerContext);

      return errorStatus;
    }
  }

  /**
   *
   */
  private registerSessionsListener() {
    this.sdkConnector.registerListener<CallSessionEvent>(
      MOBIUS_EVENT_KEYS.CALL_SESSION_EVENT_INCLUSIVE,
      async (event?: CallSessionEvent) => {
        if (event && event.data.userSessions.userSessions) {
          this.emit(COMMON_EVENT_KEYS.CALL_HISTORY_USER_SESSION_INFO, event as CallSessionEvent);
        }
      }
    );
  }
}
/**
 * Creates a `CallHistory` client instance for accessing Call History APIs.
 *
 * @param {WebexSDK} webex - `Webex SDK` instance.
 * @param {LoggerInterface} logger - An instance implementing LoggerInterface used to set the log level for the module.
 */
export const createCallHistoryClient = (webex: WebexSDK, logger: LoggerInterface): ICallHistory =>
  new CallHistory(webex, logger);
