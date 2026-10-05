export function hasCompletedLearnerProfile(user) {
  const filled = (value) => String(value || '').trim().length > 0;
  return (
    filled(user?.learnerProfile) &&
    filled(user?.visualVerbalCognitiveStyle) &&
    filled(user?.analyticWholisticCognitiveStyle)
  );
}

export function getStudentHomePath(user) {
  return hasCompletedLearnerProfile(user) ? '/course' : '/learner-profile';
}

export function mergeStudentSessionUser(currentUser, student) {
  const source = student || {};
  return {
    ...(currentUser || {}),
    id: source.id || source._id || currentUser?.id,
    name: source.name ?? currentUser?.name,
    email: source.email ?? currentUser?.email,
    mobileNumber: source.mobileNumber ?? currentUser?.mobileNumber,
    role: source.role || currentUser?.role || 'Student',
    learnerProfile: source.learnerProfile || '',
    visualVerbalCognitiveStyle: source.visualVerbalCognitiveStyle || '',
    analyticWholisticCognitiveStyle: source.analyticWholisticCognitiveStyle || '',
  };
}
