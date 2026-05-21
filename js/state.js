export const state = {
  trips: [],
  currentUser: null,
  currentTripId: null,
  currentDayIndex: 0,
  editingTripId: null,
  editingActivityId: null,
  editingActivityDate: null,
  confirmCallback: null,
  selectedColor: '#c8f060',
  unsubscribeTrips: null,
  startPicker: null,
  endPicker: null,
  tripSort: 'startDate', // 'recent' | 'startDate' | 'name' | 'manual'
  calView: 'list',
  calDateOffset: 0,
  gridScrollController: null,
  authMode: 'login',
  dpAutocompletes: [],
  detailContext: { activityId: null, date: null },
  pendingJoin: null, // { tripId, joinCode, source: 'url'|'paste' }
  unsubscribeChat: null,
  chatMessages: [],
};
