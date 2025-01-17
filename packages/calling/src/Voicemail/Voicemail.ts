/* eslint-disable dot-notation */
/* eslint-disable no-underscore-dangle */
/* eslint-disable valid-jsdoc */
import SDKConnector from '../SDKConnector';
import {ISDKConnector, WebexSDK} from '../SDKConnector/types';
import {IVoicemail, VoicemailResponseEvent, LoggerInterface, CallingPartyInfo} from './types';
import {CALLING_BACKEND, DisplayInformation, SORT} from '../common/types';
import log from '../Logger';
import {getCallingBackEnd} from '../common/Utils';
import {WxCallBackendConnector} from './WxCallBackendConnector';
import {BroadworksBackendConnector} from './BroadworksBackendConnector';
import {VoicemailEventTypes} from '../Events/types';
import {Eventing} from '../Events/impl';
import {UcmBackendConnector} from './UcmBackendConnector';
import {IMetricManager, METRIC_EVENT, METRIC_TYPE, VOICEMAIL_ACTION} from '../Metrics/types';
import {getMetricManager} from '../Metrics';
import {VOICEMAIL_FILE} from './constants';

/**
 *
 */
export class Voicemail extends Eventing<VoicemailEventTypes> implements IVoicemail {
  private sdkConnector: ISDKConnector;

  private webex: WebexSDK;

  private callingBackend: CALLING_BACKEND;

  private backendConnector!: IVoicemail;

  private metricManager: IMetricManager;

  /**
   * @param webex -.
   * @param logger -.
   */
  constructor(webex: WebexSDK, public logger: LoggerInterface) {
    super();
    this.sdkConnector = SDKConnector;
    if (!this.sdkConnector.getWebex()) {
      SDKConnector.setWebex(webex);
    }
    this.webex = this.sdkConnector.getWebex();
    this.metricManager = getMetricManager(this.webex, undefined);
    this.callingBackend = getCallingBackEnd(this.webex);
    this.initializeBackendConnector();
    log.setLogger(logger.level, VOICEMAIL_FILE);
  }

  /**
   * Voicemail connector initialization.
   *
   * @returns Response.
   */
  public init() {
    const response = this.backendConnector.init();

    return response;
  }

  /**
   * Setup and initialize the voicemail backend connector class object.
   */
  private initializeBackendConnector() {
    switch (this.callingBackend) {
      case CALLING_BACKEND.WXC: {
        this.backendConnector = new WxCallBackendConnector(this.webex, this.logger);
        break;
      }

      case CALLING_BACKEND.BWRKS: {
        this.backendConnector = new BroadworksBackendConnector(this.webex, this.logger);
        break;
      }

      case CALLING_BACKEND.UCM: {
        this.backendConnector = new UcmBackendConnector(this.webex, this.logger);
        break;
      }

      default: {
        throw new Error('Calling backend is not identified, exiting....');
      }
    }
  }

  /**
   * @param response - VoicemailResponseEvent to be used in submitting metric.
   * @param metricAction - Action for the metric being submitted.
   * @param messageId - Message identifier of the voicemail message.
   */
  private submitMetric(response: VoicemailResponseEvent, metricAction: string, messageId?: string) {
    const {
      statusCode,
      data: {error: errorMessage},
    } = response;

    if (statusCode >= 200 && statusCode < 300) {
      this.metricManager.submitVoicemailMetric(
        METRIC_EVENT.VOICEMAIL,
        metricAction,
        METRIC_TYPE.BEHAVIORAL,
        messageId
      );
    } else {
      this.metricManager.submitVoicemailMetric(
        METRIC_EVENT.VOICEMAIL_ERROR,
        metricAction,
        METRIC_TYPE.BEHAVIORAL,
        messageId,
        errorMessage,
        statusCode
      );
    }
  }

  /**
   * Call voicemail class to fetch the voicemail lists.
   *
   * @param sort - Sort voicemail list (ASC | DESC). TODO: Once we start implementing sorting.
   * @param offset - Number of records to skip.
   * @param offsetLimit - Number of voicemail list to fetch from the offset.
   * @param refresh - Refresh the list of voicemails from backend.
   * @returns Promise.
   */
  public async getVoicemailList(
    offset: number,
    offsetLimit: number,
    sort: SORT,
    refresh?: boolean
  ): Promise<VoicemailResponseEvent> {
    const response = await this.backendConnector.getVoicemailList(
      offset,
      offsetLimit,
      sort,
      refresh
    );

    this.submitMetric(response, VOICEMAIL_ACTION.GET_VOICEMAILS);

    return response;
  }

  /**
   * Fetch the voicemail contents for the messageId.
   *
   * @param messageId - String result from the voicemail list.
   * @returns Promise.
   */
  public async getVoicemailContent(messageId: string): Promise<VoicemailResponseEvent> {
    const response = await this.backendConnector.getVoicemailContent(messageId);

    this.submitMetric(response, VOICEMAIL_ACTION.GET_VOICEMAIL_CONTENT, messageId);

    return response;
  }

  /**
   * Fetches a quantitative summary of voicemails for a user.
   *
   * @returns - A Promise that resolves with the data containing null or counters for newMessages, oldMessage, newUrgentMessages, oldUrgentMessages.
   */
  public async getVoicemailSummary(): Promise<VoicemailResponseEvent | null> {
    const response = await this.backendConnector.getVoicemailSummary();

    /* istanbul ignore else */
    if (response !== null) {
      this.submitMetric(response, VOICEMAIL_ACTION.GET_VOICEMAIL_SUMMARY);
    }

    return response;
  }

  /**
   * Fetch voicemail read message status for the messageId.
   *
   * @param messageId -string result from the voicemail list.
   * @returns Promise.
   */
  public async voicemailMarkAsRead(messageId: string): Promise<VoicemailResponseEvent> {
    const response = await this.backendConnector.voicemailMarkAsRead(messageId);

    this.submitMetric(response, VOICEMAIL_ACTION.MARK_READ, messageId);

    return response;
  }

  /**
   * Fetch voicemail unread status for the messageId.
   *
   * @param messageId -string result from the voicemail list.
   * @returns Promise.
   */
  public async voicemailMarkAsUnread(messageId: string): Promise<VoicemailResponseEvent> {
    const response = await this.backendConnector.voicemailMarkAsUnread(messageId);

    this.submitMetric(response, VOICEMAIL_ACTION.MARK_UNREAD, messageId);

    return response;
  }

  /**
   * Fetch voicemail delete status for the messageId.
   *
   * @param messageId -string result from the voicemail list.
   * @returns Promise.
   */
  public async deleteVoicemail(messageId: string): Promise<VoicemailResponseEvent> {
    const response = await this.backendConnector.deleteVoicemail(messageId);

    this.submitMetric(response, VOICEMAIL_ACTION.DELETE, messageId);

    return response;
  }

  /**
   * Fetch the voicemail transcripts for the messageId.
   *
   * @param messageId - MessageId for which we need the transcript.
   * @returns Promise.
   */
  public async getVMTranscript(messageId: string): Promise<VoicemailResponseEvent | null> {
    const response = await this.backendConnector.getVMTranscript(messageId);

    if (response !== null) {
      this.submitMetric(response, VOICEMAIL_ACTION.TRANSCRIPT, messageId);
    }

    return response;
  }

  /**
   * Resolve the Contact from userId or display name.
   *
   * @param callingPartyInfo - Calling Party Info.
   */
  public resolveContact(callingPartyInfo: CallingPartyInfo): Promise<DisplayInformation | null> {
    return this.backendConnector.resolveContact(callingPartyInfo);
  }

  /**
   * SDK connector function.
   *
   * @returns SdkConnector.
   */
  public getSDKConnector(): ISDKConnector {
    return this.sdkConnector;
  }
}

/**
 * @param webex -.
 * @param logger -.
 */
export const createVoicemailClient = (webex: WebexSDK, logger: LoggerInterface): IVoicemail =>
  new Voicemail(webex, logger);
