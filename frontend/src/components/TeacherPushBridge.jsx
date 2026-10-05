import { useEffect } from 'react';
import {
  enableTeacherPushNotifications,
  startProcessingStatusPoller,
} from '../utils/pushNotifications';

export default function TeacherPushBridge() {
  useEffect(() => {
    enableTeacherPushNotifications();
    return startProcessingStatusPoller();
  }, []);
  return null;
}
