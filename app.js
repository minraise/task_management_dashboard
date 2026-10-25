(function () {
  'use strict';

  var STORAGE_KEY = 'local-work-manager:v1';
  var TAG_PALETTE = [
    { bg: '#c8cac9', border: '#99a5b1', text: '#3f556e' },
    { bg: '#cbccc0', border: '#a1ac97', text: '#4c6045' },
    { bg: '#d0c7c6', border: '#ad9da8', text: '#5f4860' },
    { bg: '#d5ccbb', border: '#bcab89', text: '#765e2e' },
    { bg: '#c5cdc5', border: '#91ada6', text: '#32625d' },
    { bg: '#cbc8ca', border: '#a09fb2', text: '#4a4c70' },
    { bg: '#ceccbc', border: '#a9a98c', text: '#585c33' },
    { bg: '#d3cac0', border: '#b7a596', text: '#6e5544' }
  ];
  // Muted, mid-tone hues. Reds are left out on purpose: red is reserved for today/overdue deadlines.
  var PROJECT_COLOR_PALETTE = [
    { accent: '#4f6a8a', soft: '#c5c8c8', tint: 'rgba(79,106,138,0.16)' },
    { accent: '#5f7856', soft: '#c9cabd', tint: 'rgba(95,120,86,0.16)' },
    { accent: '#775a78', soft: '#cdc4c4', tint: 'rgba(119,90,120,0.16)' },
    { accent: '#94763a', soft: '#d3cab8', tint: 'rgba(148,118,58,0.16)' },
    { accent: '#3f7a74', soft: '#c2cbc3', tint: 'rgba(63,122,116,0.16)' },
    { accent: '#5c5f8c', soft: '#c8c5c8', tint: 'rgba(92,95,140,0.16)' },
    { accent: '#6e7340', soft: '#ccc9b9', tint: 'rgba(110,115,64,0.16)' },
    { accent: '#8a6a55', soft: '#d1c8bd', tint: 'rgba(138,106,85,0.16)' }
  ];
  var INTERN_START_DATE = '2026-10-19';
  var INTERN_END_DATE = '2027-04-16';
  // Always open on the work board. The calendar remains available from the sidebar.
  var state = { projects: [], feedbacks: [], page: 'tasks', search: '', expanded: {}, memoExpanded: {}, subtaskMemoExpanded: {}, quickEditOpen: {}, feedbackExpanded: {}, manualOrder: { focus: false, later: false, hold: false, recurring: false, archived: false }, calendarMonth: '', dragProjectId: null, focusTarget: null };
  var els = {};
  var pendingConfirm = null;
  var toastTimer = null;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheElements();
    loadState();
    bindEvents();
    setupDashboardDropZones();
    resetFeedbackForm();
    render();
  }

  function cacheElements() {
    ['taskNavCount','calendarNavCount','feedbackNavCount','storageDot','storageStatus','viewEyebrow','viewTitle','viewSubcopy','searchInput','downloadCsv','newProjectBtn','tasksPage','calendarPage','feedbackPage','activeProjectStat','criticalStat','soonStat','subtaskStat','focusTaskList','laterTaskList','holdTaskList','recurringTaskList','archiveTaskList','focusResultCount','laterResultCount','holdResultCount','recurringResultCount','archiveResultCount','calendarMonthLabel','calendarSummary','calendarPrev','calendarToday','calendarNext','calendarGrid','calendarAgendaTitle','calendarResultCount','calendarAgendaList','projectDialog','projectForm','projectId','projectTitle','projectStatusNote','projectRequester','projectImportance','projectDeadlineMode','projectDueField','projectDue','projectRoutineField','projectCalendarRoutine','projectRoutineOptions','projectRoutineStart','projectRoutineFrequency','projectRoutineMonthdayField','projectRoutineMonthday','projectRoutineIntervalField','projectRoutineInterval','projectRoutineWeekdayField','projectRoutineWeekdays','projectLinks','projectNote','projectDialogTitle','subtaskDialog','subtaskForm','subtaskProjectId','subtaskId','subtaskTitle','subtaskDueField','subtaskDue','subtaskRoutine','subtaskRoutineOptions','subtaskRoutineStart','subtaskRoutineFrequency','subtaskRoutineMonthdayField','subtaskRoutineMonthday','subtaskRoutineWeekdayField','subtaskRoutineWeekdays','subtaskLinks','subtaskNote','subtaskDialogTitle','confirmDialog','confirmMessage','confirmCancel','confirmAccept','toast','feedbackForm','feedbackId','feedbackCategory','feedbackContent','feedbackFormTitle','feedbackCancelEdit','feedbackResultCount','feedbackList','projectRequesterSuggestions','feedbackCategorySuggestions'].forEach(function (id) { els[id] = document.getElementById(id); });
  }

  function bindEvents() {
    document.querySelectorAll('[data-page]').forEach(function (button) {
      button.addEventListener('click', function () { state.page = button.getAttribute('data-page'); render(); });
    });
    document.querySelectorAll('[data-close-dialog]').forEach(function (button) {
      button.addEventListener('click', function () { closeDialog(document.getElementById(button.getAttribute('data-close-dialog'))); });
    });
    els.searchInput.addEventListener('input', function () { state.search = els.searchInput.value; render(); });
    els.newProjectBtn.addEventListener('click', function () { openProjectDialog(); });
    els.calendarPrev.addEventListener('click', function () { moveCalendarMonth(-1); });
    els.calendarNext.addEventListener('click', function () { moveCalendarMonth(1); });
    els.calendarToday.addEventListener('click', function () { state.calendarMonth = getCurrentMonthStamp(); render(); });
    els.projectDeadlineMode.addEventListener('change', updateDeadlineModeField);
    els.projectCalendarRoutine.addEventListener('change', updateDeadlineModeField);
    els.projectRoutineFrequency.addEventListener('change', updateRoutineFrequencyFields);
    els.subtaskRoutine.addEventListener('change', updateSubtaskRoutineFields);
    els.subtaskRoutineFrequency.addEventListener('change', updateSubtaskRoutineFields);
    setupTagInput(els.projectRequester);
    setupTagInput(els.feedbackCategory);
    els.projectForm.addEventListener('submit', submitProjectForm);
    els.subtaskForm.addEventListener('submit', submitSubtaskForm);
    els.feedbackForm.addEventListener('submit', submitFeedbackForm);
    els.feedbackCancelEdit.addEventListener('click', resetFeedbackForm);
    els.downloadCsv.addEventListener('click', exportCsv);
    els.confirmCancel.addEventListener('click', function () { pendingConfirm = null; closeDialog(els.confirmDialog); });
    els.confirmAccept.addEventListener('click', function () { if (typeof pendingConfirm === 'function') pendingConfirm(); pendingConfirm = null; closeDialog(els.confirmDialog); });
  }

  function isScreenshotDemoMode() {
    return new URLSearchParams(window.location.search).get('screenshotDemo') === '1';
  }

  function loadScreenshotDemoState() {
    var now = new Date();
    var created = new Date(now.getTime() - 86400000 * 6).toISOString();
    state.manualOrder = { focus: false, later: false, hold: false, recurring: false, archived: false };
    state.expanded = { 'demo-project-1': true, 'demo-project-3': true };
    state.memoExpanded = { 'demo-project-1': true };
    state.quickEditOpen = {};
    state.subtaskMemoExpanded = { 'demo-subtask-1': true };
    state.feedbackExpanded = { 'demo-feedback-1': true };
    state.projects = [
      { id: 'demo-project-1', order: 0, title: '대구한의대 자료 정리', statusNote: '피드백 반영 중', requester: 'Jeong\nMin', dueMode: 'date', dueDate: dateOffset(0), relatedLinks: 'https://notion.so/sample-brief\nhttps://drive.google.com/sample', note: '회의 후 수정사항을 정리하고 최종본을 공유합니다.', done: false, completedAt: null, createdAt: created, updatedAt: now.toISOString(), subtasks: [
        { id: 'demo-subtask-1', title: '정 피드백 반영', dueDate: '', relatedLinks: 'https://notion.so/feedback-note', note: '상위 업무 마감일을 따라가며, 피드백 원문 링크를 확인한 뒤 반영 내용을 정리합니다.', done: false, completedAt: null, createdAt: created, updatedAt: now.toISOString() },
        { id: 'demo-subtask-2', title: '최종본 공유', dueDate: dateOffset(2), relatedLinks: 'https://drive.google.com/final', note: '공유 전 파일명과 접근 권한을 확인합니다.', done: false, completedAt: null, createdAt: created, updatedAt: now.toISOString() },
        { id: 'demo-subtask-3', title: '초안 검토 완료', dueDate: dateOffset(-1), relatedLinks: '', done: true, completedAt: new Date(now.getTime() - 86400000).toISOString(), createdAt: created, updatedAt: now.toISOString() }
      ] },
      { id: 'demo-project-2', order: 1, title: '월간 업무 보고 작성', statusNote: '초안 작성', requester: 'Hana', dueMode: 'date', dueDate: dateOffset(3), relatedLinks: 'https://docs.google.com/sample-report', note: '주간 진행 내역을 모아 월간 보고 형식으로 정리합니다.', done: false, completedAt: null, createdAt: new Date(now.getTime() - 86400000 * 3).toISOString(), updatedAt: now.toISOString(), subtasks: [
        { id: 'demo-subtask-4', title: '진행 업무 취합', dueDate: dateOffset(1), relatedLinks: '', done: false, completedAt: null, createdAt: created, updatedAt: now.toISOString() },
        { id: 'demo-subtask-5', title: 'CSV 다운로드 후 첨부', dueDate: '', relatedLinks: '', done: false, completedAt: null, createdAt: created, updatedAt: now.toISOString() }
      ] },
      { id: 'demo-project-3', order: 2, title: '브랜드 페이지 개선', statusNote: '진행 중', requester: 'Design Team\nJeong', dueMode: 'subtask', dueDate: '', relatedLinks: 'https://figma.com/sample-board', note: '하위 업무별 일정에 맞춰 콘텐츠와 디자인을 나눠 진행합니다.', done: false, completedAt: null, createdAt: new Date(now.getTime() - 86400000 * 2).toISOString(), updatedAt: now.toISOString(), subtasks: [
        { id: 'demo-subtask-6', title: '카피 문구 정리', dueDate: dateOffset(5), relatedLinks: '', done: false, completedAt: null, createdAt: created, updatedAt: now.toISOString() },
        { id: 'demo-subtask-7', title: '시안 리뷰', dueDate: dateOffset(7), relatedLinks: 'https://figma.com/sample-review', done: false, completedAt: null, createdAt: created, updatedAt: now.toISOString() }
      ] },
      { id: 'demo-project-4', order: 0, title: '지난주 회의록 정리', statusNote: '완료 보고됨', requester: 'Min', dueMode: 'date', dueDate: dateOffset(-2), relatedLinks: '', note: '완료된 업무는 오른쪽 완료함에 보관됩니다.', done: true, completedAt: new Date(now.getTime() - 86400000 * 2).toISOString(), createdAt: new Date(now.getTime() - 86400000 * 8).toISOString(), updatedAt: now.toISOString(), subtasks: [] }
    ];
    state.feedbacks = [
      { id: 'demo-feedback-1', category: '업무방식\n비즈니스매너', content: '요청받은 업무는 먼저 마감일과 기대 산출물을 확인하고, 중간 공유 시점을 같이 잡아두면 커뮤니케이션이 훨씬 편해진다.\n\n피드백은 바로 수정사항과 다음 액션으로 나눠 적어두면 나중에 업무 보고서 작성할 때 다시 찾기 쉽다.', createdAt: new Date(now.getTime() - 86400000 * 2).toISOString(), updatedAt: now.toISOString() },
      { id: 'demo-feedback-2', category: '사회생활', content: '회의 후에는 결정사항, 담당자, 마감일을 짧게 다시 공유한다. 상대가 바로 확인할 수 있게 링크와 파일 위치도 함께 남긴다.', createdAt: new Date(now.getTime() - 86400000 * 5).toISOString(), updatedAt: now.toISOString() },
      { id: 'demo-feedback-3', category: '업무방식', content: '반복되는 피드백은 카테고리 태그로 묶어두면 같은 실수를 줄이기 쉽다.', createdAt: new Date(now.getTime() - 86400000 * 7).toISOString(), updatedAt: now.toISOString() }
    ];
  }

  function dateOffset(days) {
    var date = new Date();
    date.setDate(date.getDate() + days);
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function loadState() {
    if (isScreenshotDemoMode()) {
      loadScreenshotDemoState();
      setStorageStatus('샘플 화면 표시 중', false);
      return;
    }
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) { setStorageStatus('로컬 저장 준비됨', false); return; }
      var parsed = JSON.parse(raw);
      state.projects = Array.isArray(parsed.projects) ? parsed.projects.map(function (project, index) { return normalizeProject(project, index); }) : [];
      state.feedbacks = Array.isArray(parsed.feedbacks) ? parsed.feedbacks.map(normalizeFeedback) : [];
      var preferences = parsed.preferences || {};
      state.manualOrder = normalizeManualOrderPreference(preferences.manualOrder, preferences.sortMode === 'manual');
      ensureProjectOrder();
      setStorageStatus('로컬 데이터 불러옴', false);
    } catch (error) {
      state.projects = [];
      state.feedbacks = [];
      setStorageStatus('저장소 읽기 실패', true);
      showToast('저장된 데이터를 읽지 못했습니다.');
    }
  }

  function normalizeProject(project, index) {
    var dueMode = project.dueMode || inferProjectDueMode(project);
    var createdAt = project.createdAt || new Date().toISOString();
    return {
      id: project.id || createId(),
      order: typeof project.order === 'number' ? project.order : index,
      title: project.title || '이름 없는 프로젝트',
      statusNote: project.statusNote || '',
      requester: normalizeTagsInput(project.requester || ''),
      dueMode: dueMode,
      importance: normalizeProjectImportance(project.importance || project.priority),
      dueDate: dueMode === 'date' ? project.dueDate || '' : '',
      calendarRoutine: dueMode === 'routine' || (dueMode === 'ongoing' && Boolean(project.calendarRoutine)),
      routineSchedule: normalizeRoutineSchedule(project.routineSchedule, createdAt, dueMode === 'routine' || (dueMode === 'ongoing' && Boolean(project.calendarRoutine))),
      relatedLinks: normalizeLinksText(project.relatedLinks || project.links || ''),
      note: project.note || '',
      dailyChecks: normalizeDailyChecks(project.dailyChecks),
      done: Boolean(project.done),
      onHold: !project.done && Boolean(project.onHold),
      completedAt: project.completedAt || null,
      createdAt: createdAt,
      updatedAt: project.updatedAt || createdAt,
      subtasks: Array.isArray(project.subtasks) ? project.subtasks.map(normalizeSubtask) : []
    };
  }

  function normalizeProjectImportance(value) {
    return value === 'later' ? 'later' : 'focus';
  }

  function normalizeRoutineSchedule(schedule, createdAt, isEnabled) {
    var fallbackStart = createdAt ? createdAt.slice(0, 10) : todayStamp();
    var source = schedule && typeof schedule === 'object' ? schedule : {};
    var weekdays = Array.isArray(source.weekdays) ? source.weekdays.map(function (day) { return Number(day); }).filter(function (day) { return day >= 0 && day <= 6; }) : [];
    if (!weekdays.length) weekdays = [1, 2, 3, 4, 5];
    var seen = {};
    weekdays = weekdays.filter(function (day) { if (seen[day]) return false; seen[day] = true; return true; }).sort(function (a, b) { return weekdaySortValue(a) - weekdaySortValue(b); });
    var interval = Number(source.intervalWeeks || source.interval || 1);
    var startDay = Number((source.startDate || fallbackStart).slice(-2));
    var monthDay = Number(source.monthDay || startDay || 1);
    return {
      startDate: /^\d{4}-\d{2}-\d{2}$/.test(source.startDate || '') ? source.startDate : fallbackStart,
      intervalWeeks: interval === 2 ? 2 : 1,
      frequency: source.frequency === 'monthly' ? 'monthly' : 'weekly',
      monthDay: Math.min(31, Math.max(1, monthDay)),
      weekdays: isEnabled ? weekdays : [1, 2, 3, 4, 5]
    };
  }

  function weekdaySortValue(day) {
    return day === 0 ? 7 : day;
  }

  function getImportanceLabel(value) {
    return normalizeProjectImportance(value) === 'later' ? '시간나면 할 것' : '시간내서 해야 하는 것';
  }

  function normalizeSubtask(task) {
    var createdAt = task.createdAt || new Date().toISOString();
    return { id: task.id || createId(), title: task.title || '이름 없는 하위 업무', dueDate: task.dueDate || '', calendarRoutine: Boolean(task.calendarRoutine), routineSchedule: normalizeRoutineSchedule(task.routineSchedule, createdAt, Boolean(task.calendarRoutine)), dailyChecks: normalizeDailyChecks(task.dailyChecks), relatedLinks: normalizeLinksText(task.relatedLinks || task.links || ''), note: task.note || '', done: Boolean(task.done), completedAt: task.completedAt || null, createdAt: createdAt, updatedAt: task.updatedAt || createdAt };
  }

  function normalizeDailyChecks(value) {
    var checks = {};
    if (!value || typeof value !== 'object') return checks;
    Object.keys(value).forEach(function (date) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && value[date]) checks[date] = value[date];
    });
    return checks;
  }

  function normalizeFeedback(item) {
    var createdAt = item.createdAt || new Date().toISOString();
    var category = normalizeTagsInput(item.category || item.status || '');
    var content = item.content || '';
    var legacy = [];
    if (item.project) legacy.push('관련 업무: ' + item.project);
    if (item.from) legacy.push('피드백 준 사람: ' + item.from);
    if (item.feedbackDate) legacy.push('피드백일: ' + item.feedbackDate);
    if (item.action) legacy.push('후속 조치: ' + item.action);
    if (legacy.length) content = content ? content + '\n\n' + legacy.join('\n') : legacy.join('\n');
    return { id: item.id || createId(), category: category, content: content, createdAt: createdAt, updatedAt: item.updatedAt || createdAt };
  }

  function inferProjectDueMode(project) {
    if (project && project.dueDate) return 'date';
    if (project && Array.isArray(project.subtasks) && project.subtasks.some(function (task) { return task.dueDate; })) return 'subtask';
    return 'ongoing';
  }

  function saveState(message) {
    if (isScreenshotDemoMode()) {
      setStorageStatus('샘플 화면 표시 중', false);
      if (message) showToast(message);
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 11, projects: state.projects, feedbacks: state.feedbacks, preferences: { manualOrder: state.manualOrder } }));
      setStorageStatus('로컬 저장 완료', false);
      if (message) showToast(message);
    } catch (error) {
      setStorageStatus('로컬 저장 실패', true);
      showToast('로컬 저장에 실패했습니다.');
    }
  }

  function render() {
    renderShell();
    renderTagSuggestions();
    if (state.page === 'feedback') renderFeedbackPage();
    else if (state.page === 'calendar') renderCalendarPage();
    else renderTaskPage();
  }

  function renderShell() {
    var activeCount = state.projects.filter(function (project) { return getProjectGroup(project) === 'active'; }).length;
    var holdCount = state.projects.filter(function (project) { return getProjectGroup(project) === 'hold'; }).length;
    var recurringCount = state.projects.filter(function (project) { return getProjectGroup(project) === 'recurring'; }).length;
    var archiveCount = state.projects.filter(function (project) { return getProjectGroup(project) === 'archived'; }).length;
    var calendarCount = getCalendarEvents('', state.calendarMonth || getCurrentMonthStamp()).filter(function (event) { return !event.done; }).length;
    els.taskNavCount.textContent = activeCount + '/' + holdCount + '/' + recurringCount + '/' + archiveCount;
    els.calendarNavCount.textContent = String(calendarCount);
    els.feedbackNavCount.textContent = String(state.feedbacks.length);
    document.querySelectorAll('[data-page]').forEach(function (button) { button.classList.toggle('is-active', button.getAttribute('data-page') === state.page); });
    els.tasksPage.classList.toggle('is-hidden', state.page !== 'tasks');
    els.calendarPage.classList.toggle('is-hidden', state.page !== 'calendar');
    els.feedbackPage.classList.toggle('is-hidden', state.page !== 'feedback');
    els.newProjectBtn.classList.toggle('is-hidden', state.page === 'feedback');
    if (state.page === 'feedback') {
      els.viewEyebrow.textContent = 'Feedback';
      els.viewTitle.textContent = '피드백 정리';
      els.viewSubcopy.textContent = '카테고리 태그와 메모만 간단히 남깁니다.';
      els.searchInput.placeholder = '피드백 내용이나 카테고리 검색';
    } else if (state.page === 'calendar') {
      els.viewEyebrow.textContent = 'Calendar';
      els.viewTitle.textContent = '업무 캘린더';
      els.viewSubcopy.textContent = '오늘 할 일 브리핑과 월간 업무 일정을 함께 확인합니다.';
      els.searchInput.placeholder = '캘린더 일정, 업무명, 태그 검색';
    } else {
      els.viewEyebrow.textContent = 'Work Board';
      els.viewTitle.textContent = '업무 현황';
      els.viewSubcopy.textContent = '진행 중과 완료함을 한 화면에서 확인합니다.';
      els.searchInput.placeholder = '업무, 상태, 링크, 이름 검색';
    }
  }


  function renderCalendarPage() {
    ensureCalendarMonth();
    var query = state.search.trim().toLowerCase();
    var month = state.calendarMonth;
    var events = getCalendarEvents(query, month);
    var monthEvents = events.filter(function (event) { return event.date.slice(0, 7) === month; });
    var activeMonthEvents = monthEvents.filter(function (event) { return !event.done; });
    els.calendarMonthLabel.textContent = formatCalendarMonth(month);
    els.calendarSummary.textContent = monthEvents.length + '개 일정 · 진행 중 ' + activeMonthEvents.length + '개';
    els.calendarResultCount.textContent = monthEvents.length + '개';
    els.calendarAgendaTitle.textContent = query ? '검색된 일정' : '이번 달 일정';
    renderTodayBriefing(query);
    renderCalendarGrid(month, events);
    renderCalendarAgenda(monthEvents);
  }

  function renderTodayBriefing(query) {
    var card = document.getElementById('todayBriefingCard');
    if (!card) {
      card = createElement('section', 'today-briefing-card');
      card.id = 'todayBriefingCard';
      card.setAttribute('aria-label', '오늘 업무 브리핑');
      if (els.calendarPage.firstChild) els.calendarPage.insertBefore(card, els.calendarPage.firstChild);
      else els.calendarPage.appendChild(card);
    }
    var items = getTodayBriefingEvents(query);
    var today = todayStamp();
    var overdueCount = items.filter(function (event) { return event.date < today; }).length;
    var routineCount = items.filter(function (event) { return event.type === 'routine'; }).length;
    var todayCount = items.length - overdueCount;
    card.replaceChildren();
    var head = createElement('div', 'today-briefing-head');
    var copy = createElement('div', 'today-briefing-copy');
    copy.appendChild(createElement('span', 'pixel-kicker', 'TODAY BRIEFING'));
    copy.appendChild(createElement('h3', '', items.length ? '오늘 볼 업무 ' + items.length + '개' : '오늘은 바로 처리할 업무가 없습니다'));
    copy.appendChild(createElement('p', '', formatDate(today) + ' 기준 · 오늘 ' + todayCount + '개 · 밀린 업무 ' + overdueCount + '개 · 반복 체크 ' + routineCount + '개'));
    head.appendChild(copy);
    var goToday = createElement('button', 'button secondary compact', '오늘로 이동');
    goToday.type = 'button';
    goToday.addEventListener('click', function () { state.calendarMonth = getCurrentMonthStamp(); render(); });
    head.appendChild(goToday);
    card.appendChild(head);
    var list = createElement('div', 'today-briefing-list');
    if (!items.length) {
      list.appendChild(createElement('p', 'today-briefing-empty', '마감이 오늘이거나 지난 미완료 업무가 없고, 오늘 체크할 반복 업무도 없습니다.'));
    } else {
      items.forEach(function (event) { list.appendChild(buildTodayBriefingItem(event)); });
    }
    card.appendChild(list);
  }

  function buildTodayBriefingItem(event) {
    var item = createElement('div', 'today-briefing-item status-' + event.status);
    applyCalendarEventColor(item, event);
    item.dataset.projectId = event.projectId;
    if (event.taskId) item.dataset.subtaskId = event.taskId;
    if (event.date < todayStamp()) item.classList.add('is-overdue');
    makeCalendarEventInteractive(item, event);
    var status = createElement('div', 'today-briefing-status');
    status.appendChild(createElement('strong', '', getBriefingStatusText(event)));
    status.appendChild(createElement('span', '', formatCalendarShortDate(event.date)));
    var body = createElement('div', 'today-briefing-body');
    body.appendChild(createElement('p', 'today-briefing-title', event.title));
    body.appendChild(createElement('span', 'today-briefing-meta', getCalendarEventTypeLabel(event) + ' · ' + event.projectTitle));
    if (event.type === 'routine') body.appendChild(buildRoutineCheckControl(event));
    item.appendChild(status);
    item.appendChild(body);
    return item;
  }

  function getBriefingStatusText(event) {
    if (event.type === 'routine') return '오늘 체크';
    var diff = daysUntil(event.date);
    if (diff < 0) return '밀림 D+' + Math.abs(diff);
    if (diff === 0) return '오늘 마감';
    return event.statusText || '확인';
  }

  function renderCalendarGrid(month, events) {
    els.calendarGrid.replaceChildren();
    var first = parseMonthStamp(month);
    var start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
    for (var index = 0; index < 42; index += 1) {
      var date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      var dateValue = dateToStamp(date);
      var dayEvents = events.filter(function (event) { return event.date === dateValue; });
      els.calendarGrid.appendChild(buildCalendarDay(date, month, dayEvents));
    }
  }

  function buildCalendarDay(date, month, events) {
    var dateValue = dateToStamp(date);
    var cell = createElement('div', 'calendar-day');
    if (dateToMonthStamp(date) !== month) cell.classList.add('is-outside');
    if (dateValue === todayStamp()) cell.classList.add('is-today');
    var head = createElement('div', 'calendar-day-head');
    head.appendChild(createElement('span', 'calendar-day-number', String(date.getDate())));
    if (events.length) head.appendChild(createElement('span', 'calendar-day-count', events.length + '개'));
    cell.appendChild(head);
    var list = createElement('div', 'calendar-event-list');
    events.forEach(function (event) { list.appendChild(buildCalendarEventChip(event)); });
    cell.appendChild(list);
    return cell;
  }

  function buildCalendarEventChip(event) {
    var chip = createElement('div', 'calendar-event status-' + event.status);
    applyCalendarEventColor(chip, event);
    if (event.done) chip.classList.add('is-done');
    chip.title = event.projectTitle + ' · ' + event.label + ' · ' + event.title;
    makeCalendarEventInteractive(chip, event);
    if (event.type === 'routine') chip.appendChild(buildRoutineCheckControl(event));
    chip.appendChild(createElement('span', 'calendar-event-type', getCalendarEventTypeLabel(event)));
    chip.appendChild(createElement('span', 'calendar-event-title', event.title));
    return chip;
  }

  function renderCalendarAgenda(events) {
    els.calendarAgendaList.replaceChildren();
    if (!events.length) { els.calendarAgendaList.appendChild(buildEmptyState('표시할 일정이 없습니다.')); return; }
    events.slice().sort(function (a, b) { return dueStamp(a.date) - dueStamp(b.date) || a.done - b.done || a.title.localeCompare(b.title); }).forEach(function (event) {
      els.calendarAgendaList.appendChild(buildCalendarAgendaItem(event));
    });
  }

  function buildCalendarAgendaItem(event) {
    var item = createElement('div', 'calendar-agenda-item status-' + event.status);
    applyCalendarEventColor(item, event);
    if (event.done) item.classList.add('is-done');
    makeCalendarEventInteractive(item, event);
    var date = createElement('div', 'calendar-agenda-date');
    date.appendChild(createElement('strong', '', formatCalendarShortDate(event.date)));
    date.appendChild(createElement('span', '', event.done ? '완료' : event.statusText));
    var body = createElement('div', 'calendar-agenda-body');
    body.appendChild(createElement('p', 'calendar-agenda-title', event.title));
    body.appendChild(createElement('span', 'calendar-agenda-meta', event.label + ' · ' + event.projectTitle));
    if (event.type === 'routine') body.appendChild(buildRoutineCheckControl(event));
    if (event.note) body.appendChild(createElement('p', 'calendar-agenda-note', event.note));
    item.appendChild(date);
    item.appendChild(body);
    return item;
  }

  function getCalendarEvents(query, month) {
    var normalized = String(query || '').trim().toLowerCase();
    var calendarMonth = month || state.calendarMonth || getCurrentMonthStamp();
    var events = [];
    state.projects.forEach(function (project) {
      if (!project.done && !project.onHold && (isRecurringProject(project) || (project.dueMode === 'ongoing' && project.calendarRoutine))) {
        buildOngoingCalendarEvents(project, calendarMonth).forEach(function (event) { addCalendarEvent(events, event, normalized); });
      }
      if (project.dueMode === 'date' && project.dueDate) {
        addCalendarEvent(events, buildCalendarEvent(project.dueDate, 'project', project.title, project, null, '상위 업무', project.done), normalized);
      }
      project.subtasks.forEach(function (task) {
        if (!project.done && !project.onHold && !task.done && task.calendarRoutine) {
          getRoutineDatesInMonth(task, calendarMonth).forEach(function (date) { addCalendarEvent(events, buildRoutineCalendarEvent(project, date, task), normalized); });
        }
        var due = getEffectiveSubtaskDue(task, project);
        if (!due) return;
        addCalendarEvent(events, buildCalendarEvent(due, 'subtask', task.title, project, task, task.dueDate ? '하위 업무' : '하위 업무 · 상위 기한', task.done || project.done), normalized);
      });
    });
    return events.sort(function (a, b) { return dueStamp(a.date) - dueStamp(b.date) || a.done - b.done || a.title.localeCompare(b.title); });
  }

  function getTodayBriefingEvents(query) {
    var normalized = String(query || '').trim().toLowerCase();
    var today = todayStamp();
    var events = [];
    state.projects.forEach(function (project) {
      if (project.done || project.onHold) return;
      if ((isRecurringProject(project) || (project.dueMode === 'ongoing' && project.calendarRoutine)) && getRoutineDatesInMonth(project, today.slice(0, 7)).indexOf(today) >= 0 && !isOngoingChecked(project, today)) {
        addCalendarEvent(events, buildRoutineCalendarEvent(project, today), normalized);
      }
      if (project.dueMode === 'date' && project.dueDate && project.dueDate <= today) {
        addCalendarEvent(events, buildCalendarEvent(project.dueDate, 'project', project.title, project, null, '상위 업무', false), normalized);
      }
      project.subtasks.forEach(function (task) {
        if (!task.done && task.calendarRoutine && getRoutineDatesInMonth(task, today.slice(0, 7)).indexOf(today) >= 0 && !isOngoingChecked(task, today)) {
          addCalendarEvent(events, buildRoutineCalendarEvent(project, today, task), normalized);
        }
        var due = getEffectiveSubtaskDue(task, project);
        if (!task.done && due && due <= today) addCalendarEvent(events, buildCalendarEvent(due, 'subtask', task.title, project, task, task.dueDate ? '하위 업무' : '하위 업무 · 상위 기한', false), normalized);
      });
    });
    return events.sort(function (a, b) {
      return getBriefingSortRank(a) - getBriefingSortRank(b) || dueStamp(a.date) - dueStamp(b.date) || a.title.localeCompare(b.title);
    });
  }

  function getBriefingSortRank(event) {
    if (event.date < todayStamp()) return 0;
    if (event.type !== 'routine') return 1;
    return 2;
  }

  function addCalendarEvent(events, event, query) {
    if (!query || matchesCalendarEvent(event, query)) events.push(event);
  }

  function buildCalendarEvent(date, type, title, project, task, label, done) {
    var statusSource = task || project;
    var status = task ? getDeadlineStatus(task, project) : getDeadlineStatus(project);
    var color = getProjectColor(project);
    return {
      date: date,
      type: type,
      title: title,
      projectTitle: project.title,
      label: label,
      done: Boolean(done),
      status: status.level,
      statusText: status.text,
      note: task ? task.note || '' : project.note || '',
      requester: project.requester || '',
      color: color,
      statusNote: project.statusNote || '',
      relatedLinks: (task && task.relatedLinks) || project.relatedLinks || '',
      projectId: project.id,
      taskId: task ? task.id : '',
      id: (task && task.id) || project.id
    };
  }

  function buildOngoingCalendarEvents(project, month) {
    return getRoutineDatesInMonth(project, month).map(function (date) {
      return buildRoutineCalendarEvent(project, date);
    });
  }

  function buildRoutineCalendarEvent(project, date, task) {
    var source = task || project;
    var checked = isOngoingChecked(source, date);
    return {
      date: date,
      type: 'routine',
      title: task ? task.title : project.title,
      projectTitle: project.title,
      label: getRoutineScheduleLabel(source),
      done: checked,
      status: checked ? 'done' : 'timeline',
      statusText: checked ? '체크 완료' : '체크 필요',
      note: task ? task.note || '' : project.note || '',
      requester: project.requester || '',
      color: getProjectColor(project),
      statusNote: project.statusNote || '',
      relatedLinks: task ? task.relatedLinks || project.relatedLinks || '' : project.relatedLinks || '',
      projectId: project.id,
      taskId: task ? task.id : '',
      id: project.id + ':' + (task ? task.id + ':' : '') + date,
      routineDate: date
    };
  }

  function applyCalendarEventColor(element, event) {
    applyProjectColorVars(element, event.color || getProjectColor(findProject(event.projectId) || {}));
  }

  function getRoutineDatesInMonth(item, month) {
    var schedule = normalizeRoutineSchedule(item.routineSchedule, item.createdAt, item.calendarRoutine);
    var createdDate = item.createdAt ? item.createdAt.slice(0, 10) : '';
    var startDate = maxDateString(createdDate, schedule.startDate);
    var first = parseMonthStamp(month);
    var dates = [];
    var date = new Date(first.getFullYear(), first.getMonth(), 1);
    while (date.getMonth() === first.getMonth()) {
      var stamp = dateToStamp(date);
      if ((!startDate || stamp >= startDate) && matchesRoutineDate(date, schedule)) dates.push(stamp);
      date.setDate(date.getDate() + 1);
    }
    return dates;
  }

  function matchesRoutineDate(date, schedule) {
    if (schedule.frequency === 'monthly') {
      var lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      return date.getDate() === Math.min(schedule.monthDay, lastDay);
    }
    return schedule.weekdays.indexOf(date.getDay()) >= 0 && matchesRoutineInterval(date, schedule);
  }

  function matchesRoutineInterval(date, schedule) {
    if (schedule.intervalWeeks <= 1) return true;
    var anchor = new Date(schedule.startDate + 'T00:00:00');
    if (Number.isNaN(anchor.getTime())) return true;
    var weeks = Math.floor((startOfWeek(date).getTime() - startOfWeek(anchor).getTime()) / (86400000 * 7));
    return weeks >= 0 && weeks % schedule.intervalWeeks === 0;
  }

  function startOfWeek(date) {
    var copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    copy.setDate(copy.getDate() - copy.getDay());
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  function maxDateString(a, b) {
    if (!a) return b || '';
    if (!b) return a || '';
    return a > b ? a : b;
  }

  function isOngoingChecked(project, date) {
    return Boolean(project.dailyChecks && project.dailyChecks[date]);
  }

  function matchesCalendarEvent(event, query) {
    return [event.title, event.projectTitle, event.label, event.note, event.requester, event.statusNote, event.relatedLinks, event.statusText].some(function (value) { return matchesText(value, query); });
  }

  function getCalendarEventTypeLabel(event) {
    if (event.type === 'project') return '상위';
    if (event.type === 'routine') return event.taskId ? '하위 반복' : '반복';
    return '하위';
  }

  function buildRoutineCheckControl(event) {
    var control = createElement('label', 'routine-check');
    var checkbox = createElement('input', 'routine-check-input');
    checkbox.type = 'checkbox';
    checkbox.checked = event.done;
    checkbox.setAttribute('aria-label', event.date + ' ' + event.title + ' 체크');
    var text = createElement('span', '', event.done ? '완료' : '체크');
    control.addEventListener('click', function (domEvent) { domEvent.stopPropagation(); });
    control.addEventListener('keydown', function (domEvent) { domEvent.stopPropagation(); });
    checkbox.addEventListener('change', function (domEvent) {
      domEvent.stopPropagation();
      toggleRoutineCheck(event.projectId, event.taskId, event.date, checkbox.checked);
    });
    control.appendChild(checkbox);
    control.appendChild(text);
    return control;
  }

  function toggleRoutineCheck(projectId, taskId, date, isDone) {
    var project = findProject(projectId);
    if (!project) return;
    var item = taskId ? project.subtasks.find(function (task) { return task.id === taskId; }) : project;
    if (!item) return;
    if (!item.dailyChecks) item.dailyChecks = {};
    var now = new Date().toISOString();
    if (isDone) item.dailyChecks[date] = now;
    else delete item.dailyChecks[date];
    item.updatedAt = now;
    project.updatedAt = now;
    saveState(isDone ? '반복 업무를 완료 체크했습니다.' : '반복 업무 체크를 해제했습니다.');
    render();
  }

  function makeCalendarEventInteractive(element, event) {
    element.setAttribute('role', 'button');
    element.setAttribute('tabindex', '0');
    element.setAttribute('aria-label', event.title + ' 업무로 이동');
    element.addEventListener('click', function () { goToCalendarEvent(event); });
    element.addEventListener('keydown', function (keyboardEvent) {
      if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
        keyboardEvent.preventDefault();
        goToCalendarEvent(event);
      }
    });
  }

  function goToCalendarEvent(event) {
    state.page = 'tasks';
    state.search = '';
    if (els.searchInput) els.searchInput.value = '';
    state.expanded[event.projectId] = true;
    state.focusTarget = { projectId: event.projectId, taskId: event.taskId || '' };
    render();
    window.requestAnimationFrame(function () { scrollToFocusedWork(event.projectId, event.taskId); });
    showToast('업무현황에서 해당 업무로 이동했습니다.');
  }

  function scrollToFocusedWork(projectId, taskId) {
    var projectSelector = '[data-project-id="' + escapeSelectorValue(projectId) + '"]';
    var taskSelector = taskId ? '[data-subtask-id="' + escapeSelectorValue(taskId) + '"]' : '';
    var target = taskSelector ? document.querySelector(taskSelector) : null;
    if (!target) target = document.querySelector(projectSelector);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(function () {
      document.querySelectorAll('.is-focus-target').forEach(function (element) { element.classList.remove('is-focus-target'); });
      state.focusTarget = null;
    }, 2400);
  }

  function escapeSelectorValue(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value));
    return String(value).replace(/["\\]/g, function (character) { return '\\' + character; });
  }

  function moveCalendarMonth(delta) {
    ensureCalendarMonth();
    state.calendarMonth = offsetMonthStamp(state.calendarMonth, delta);
    render();
  }

  function ensureCalendarMonth() {
    if (!state.calendarMonth) state.calendarMonth = getCurrentMonthStamp();
  }

  function renderTaskPage() {
    renderInternProgress();
    renderTodayRoutineChecklist();
    updateStats();
    var query = state.search.trim().toLowerCase();
    var focus = getProjectList('focus', query);
    var later = getProjectList('later', query);
    var hold = getProjectList('hold', query);
    var recurring = getProjectList('recurring', query);
    var archived = getProjectList('archived', query);
    els.focusResultCount.textContent = focus.length + '개';
    els.laterResultCount.textContent = later.length + '개';
    els.holdResultCount.textContent = hold.length + '개';
    els.recurringResultCount.textContent = recurring.length + '개';
    els.archiveResultCount.textContent = archived.length + '개';
    renderProjectList(els.focusTaskList, focus, '시간내서 해야 하는 업무가 없습니다.');
    renderProjectList(els.laterTaskList, later, '시간나면 할 업무가 없습니다.');
    renderProjectList(els.holdTaskList, hold, '보류 중인 업무가 없습니다.');
    renderProjectList(els.recurringTaskList, recurring, '등록된 반복 업무가 없습니다.');
    renderProjectList(els.archiveTaskList, archived, '완료된 업무가 없습니다.');
  }

  function renderTodayRoutineChecklist() {
    var card = document.getElementById('todayRoutineChecklist');
    if (!card) {
      card = createElement('section', 'today-briefing-card');
      card.id = 'todayRoutineChecklist';
      card.setAttribute('aria-label', '오늘의 반복 업무');
      var stats = els.tasksPage.querySelector('.stats-grid');
      if (stats) els.tasksPage.insertBefore(card, stats); else els.tasksPage.appendChild(card);
    }
    var today = todayStamp();
    var items = [];
    state.projects.forEach(function (project) {
      if (project.done || project.onHold) return;
      if (isRecurringProject(project) && getRoutineDatesInMonth(project, today.slice(0, 7)).indexOf(today) >= 0) items.push(buildRoutineCalendarEvent(project, today));
      project.subtasks.forEach(function (task) {
        if (!task.done && task.calendarRoutine && getRoutineDatesInMonth(task, today.slice(0, 7)).indexOf(today) >= 0) items.push(buildRoutineCalendarEvent(project, today, task));
      });
    });
    card.replaceChildren();
    var head = createElement('div', 'today-briefing-head');
    var copy = createElement('div', 'today-briefing-copy');
    copy.appendChild(createElement('span', 'pixel-kicker', 'TODAY ROUTINE'));
    copy.appendChild(createElement('h3', '', items.length ? '오늘의 반복 업무 ' + items.length + '개' : '오늘 체크할 반복 업무가 없습니다'));
    copy.appendChild(createElement('p', '', formatDate(today) + ' 기준 · 체크하면 오늘 일정만 완료 처리됩니다.'));
    head.appendChild(copy);
    card.appendChild(head);
    var list = createElement('div', 'today-briefing-list');
    if (!items.length) list.appendChild(createElement('p', 'today-briefing-empty', '오늘 예정된 반복 업무가 없습니다.'));
    else items.forEach(function (item) { list.appendChild(buildTodayBriefingItem(item)); });
    card.appendChild(list);
  }

  function renderInternProgress() {
    var card = document.getElementById('internProgressCard');
    if (!card) {
      card = createElement('section', 'intern-progress-card');
      card.id = 'internProgressCard';
      card.setAttribute('aria-label', '인턴 기간 진행률');
      if (els.tasksPage.firstChild) els.tasksPage.insertBefore(card, els.tasksPage.firstChild);
      else els.tasksPage.appendChild(card);
    }

    var progress = getInternProgress();
    card.style.setProperty('--intern-progress', progress.percent + '%');
    card.replaceChildren();

    var copy = createElement('div', 'intern-progress-copy');
    copy.appendChild(createElement('span', 'pixel-kicker', 'INTERNSHIP QUEST'));
    copy.appendChild(createElement('h3', '', '인턴 기간 ' + progress.percentText + ' 진행 중'));
    copy.appendChild(createElement('p', '', INTERN_START_DATE.replace(/-/g, '.') + '부터 ' + INTERN_END_DATE.replace(/-/g, '.') + '까지 · 전체 ' + progress.totalDays + '일 중 ' + progress.dayNumber + '일차 · D-' + progress.remainingDays));

    var meterWrap = createElement('div', 'intern-progress-meter-wrap');
    var meterTop = createElement('div', 'intern-progress-meter-top');
    meterTop.appendChild(createElement('span', '', formatInternMonthDay(INTERN_START_DATE)));
    meterTop.appendChild(createElement('strong', '', progress.percentText));
    meterTop.appendChild(createElement('span', '', formatInternMonthDay(INTERN_END_DATE)));
    var meter = createElement('div', 'intern-progress-meter');
    meter.appendChild(createElement('span', 'intern-progress-fill'));
    meterWrap.appendChild(meterTop);
    meterWrap.appendChild(meter);

    card.appendChild(copy);
    card.appendChild(meterWrap);
  }

  function formatInternMonthDay(dateText) {
    var parts = dateText.split('-');
    return Number(parts[1]) + '월 ' + Number(parts[2]) + '일';
  }

  function getInternProgress() {
    var start = new Date(INTERN_START_DATE + 'T00:00:00');
    var end = new Date(INTERN_END_DATE + 'T00:00:00');
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
    var rawDayNumber = Math.floor((today.getTime() - start.getTime()) / 86400000) + 1;
    var dayNumber = Math.min(totalDays, Math.max(0, rawDayNumber));
    var ratio = Math.min(1, Math.max(0, dayNumber / totalDays));
    var percent = Math.round(ratio * 1000) / 10;
    var remainingDays = Math.max(0, Math.ceil((end.getTime() - today.getTime()) / 86400000));
    return {
      percent: percent,
      percentText: percent.toFixed(percent % 1 === 0 ? 0 : 1) + '%',
      dayNumber: dayNumber,
      totalDays: totalDays,
      remainingDays: remainingDays
    };
  }

  function getProjectList(group, query) {
    return state.projects.filter(function (project) { return getProjectListGroup(project) === group; }).filter(function (project) { return !query || matchesProjectQuery(project, query); }).sort(function (a, b) {
      return compareProjectOrder(a, b, group);
    });
  }

  function getProjectGroup(project) {
    if (project.done) return 'archived';
    if (isRecurringProject(project)) return 'recurring';
    if (project.onHold) return 'hold';
    return 'active';
  }

  function getProjectListGroup(project) {
    if (project.done) return 'archived';
    if (isRecurringProject(project)) return 'recurring';
    if (project.onHold) return 'hold';
    return getActiveImportanceGroup(project);
  }

  function isRecurringProject(project) {
    return project.dueMode === 'routine';
  }

  function getActiveImportanceGroup(project) {
    return normalizeProjectImportance(project.importance) === 'later' ? 'later' : 'focus';
  }

  function compareProjectOrder(a, b, group) {
    if (group === 'archived') return dateStamp(b.completedAt) - dateStamp(a.completedAt) || dateStamp(b.updatedAt) - dateStamp(a.updatedAt);
    var urgencyComparison = compareProjectUrgency(a, b);
    if (urgencyComparison) return urgencyComparison;
    if (isManualOrder(group)) return a.order - b.order || dateStamp(a.createdAt) - dateStamp(b.createdAt);
    if (group === 'hold') return dateStamp(b.updatedAt) - dateStamp(a.updatedAt) || dateStamp(a.createdAt) - dateStamp(b.createdAt);
    return earliestDueStamp(a) - earliestDueStamp(b) || dateStamp(a.createdAt) - dateStamp(b.createdAt);
  }

  function compareProjectUrgency(a, b) {
    var aUrgency = getProjectUrgency(a);
    var bUrgency = getProjectUrgency(b);
    if (aUrgency.rank !== bUrgency.rank) return aUrgency.rank - bUrgency.rank;
    if (aUrgency.rank < 5 && aUrgency.stamp !== bUrgency.stamp) return aUrgency.stamp - bUrgency.stamp;
    return 0;
  }

  function getProjectUrgency(project) {
    var stamp = earliestDueStamp(project);
    if (!Number.isFinite(stamp)) return { rank: 5, diff: Number.POSITIVE_INFINITY, stamp: stamp };
    var diff = daysUntilStamp(stamp);
    if (diff < 0) return { rank: 0, diff: diff, stamp: stamp };
    if (diff === 0) return { rank: 1, diff: diff, stamp: stamp };
    if (diff === 1) return { rank: 2, diff: diff, stamp: stamp };
    if (diff === 2) return { rank: 3, diff: diff, stamp: stamp };
    if (diff === 3) return { rank: 4, diff: diff, stamp: stamp };
    return { rank: 5, diff: diff, stamp: stamp };
  }

  function isManualOrder(group) {
    return Boolean(state.manualOrder[group]);
  }

  function setManualOrder(group, value) {
    state.manualOrder[group] = Boolean(value);
  }

  function renderProjectList(container, projects, emptyText) {
    container.replaceChildren();
    if (projects.length === 0) { container.appendChild(buildEmptyState(emptyText)); return; }
    projects.forEach(function (project) { container.appendChild(buildProject(project)); });
  }

  function updateStats() {
    var activeProjects = state.projects.filter(function (project) { return getProjectGroup(project) === 'active'; });
    var critical = 0, soon = 0, subDone = 0, subTotal = 0;
    activeProjects.forEach(function (project) {
      if (project.dueMode === 'date') countDeadline(project);
      project.subtasks.forEach(function (task) { subTotal += 1; if (task.done) { subDone += 1; return; } countDeadline(task, project); });
    });
    function countDeadline(item, project) { var status = getDeadlineStatus(item, project); if (status.level === 'critical') critical += 1; if (status.level === 'soon') soon += 1; }
    els.activeProjectStat.textContent = String(activeProjects.length);
    els.criticalStat.textContent = String(critical);
    els.soonStat.textContent = String(soon);
    els.subtaskStat.textContent = subDone + '/' + subTotal;
  }

  function matchesProjectQuery(project, query) {
    if (matchesText(project.title, query)) return true;
    if (matchesText(project.statusNote, query)) return true;
    if (matchesText(project.requester, query)) return true;
    if (matchesText(project.note, query)) return true;
    if (matchesText(project.relatedLinks, query)) return true;
    if (matchesText(getDueModeLabel(project.dueMode), query)) return true;
    if (matchesText(getImportanceLabel(project.importance), query)) return true;
    if (project.onHold && matchesText('보류', query)) return true;
    if (project.calendarRoutine && matchesText('캘린더 반복 체크 ' + getRoutineScheduleLabel(project), query)) return true;
    return project.subtasks.some(function (task) { return matchesText(task.title, query) || matchesText(task.relatedLinks, query) || matchesText(task.note, query); });
  }

  function buildProject(project) {
    var status = getDeadlineStatus(project);
    var urgencyClass = getProjectUrgencyClass(project);
    var isOpen = Boolean(state.expanded[project.id]);
    var article = createElement('article', 'project-item status-' + status.level);
    if (isRecurringProject(project)) article.classList.add('is-recurring');
    article.dataset.projectId = project.id;
    applyProjectCardColor(article, project);
    if (urgencyClass) article.classList.add(urgencyClass);
    article.draggable = true;
    if (isOpen) article.classList.add('is-open');
    if (isFocusedProject(project.id)) article.classList.add('is-focus-target');
    article.addEventListener('dragstart', function (event) { if (shouldBlockProjectDrag(event.target)) { event.preventDefault(); return; } startProjectDrag(event, project.id); });
    article.addEventListener('dragend', clearProjectDragState);
    article.addEventListener('dragover', function (event) { handleProjectDragOver(event, project.id); });
    article.addEventListener('dragleave', function () { article.classList.remove('drop-before', 'drop-after'); });
    article.addEventListener('drop', function (event) { handleProjectDrop(event, project.id); });
    var head = createElement('div', 'project-head');
    var dragHandle = createElement('button', 'drag-handle');
    dragHandle.type = 'button';
    dragHandle.draggable = true;
    dragHandle.title = '끌어서 업무 순서 변경';
    dragHandle.setAttribute('aria-label', project.title + ' 순서 변경');
    dragHandle.appendChild(svgIcon('grip'));
    dragHandle.addEventListener('dragstart', function (event) { event.stopPropagation(); startProjectDrag(event, project.id); });
    dragHandle.addEventListener('dragend', clearProjectDragState);
    var checkbox = createElement('input', 'check-input');
    checkbox.type = 'checkbox'; checkbox.checked = project.done; checkbox.disabled = isRecurringProject(project); checkbox.setAttribute('aria-label', isRecurringProject(project) ? project.title + ' 반복 업무는 오늘 체크리스트에서 완료 처리' : project.title + ' 완료 처리');
    checkbox.addEventListener('change', function () { toggleProject(project.id, checkbox.checked); });
    var toggle = createElement('button', 'project-toggle');
    toggle.type = 'button'; toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.appendChild(svgIcon('chevron', 'chevron-icon')); toggle.appendChild(buildProjectCopy(project));
    toggle.addEventListener('click', function () { state.expanded[project.id] = !isOpen; render(); });
    var actions = createElement('div', 'project-actions');
    if (!project.done) { var addButton = iconButton('plus', '하위 업무 추가'); addButton.addEventListener('click', function () { openSubtaskDialog(project.id); }); actions.appendChild(addButton); }
    if (!project.done) { var holdButton = iconButton(project.onHold ? 'play' : 'pause', project.onHold ? '진행 중으로 이동' : '보류로 이동'); holdButton.addEventListener('click', function () { toggleProjectHold(project.id); }); actions.appendChild(holdButton); }
    var editButton = iconButton('edit', '프로젝트 수정'); editButton.addEventListener('click', function () { openProjectDialog(project); }); actions.appendChild(editButton);
    var deleteButton = iconButton('trash', '프로젝트 삭제'); deleteButton.addEventListener('click', function () { openConfirm('프로젝트와 포함된 하위 업무를 삭제합니다.', function () { state.projects = state.projects.filter(function (item) { return item.id !== project.id; }); saveState('프로젝트를 삭제했습니다.'); render(); }); }); actions.appendChild(deleteButton);
    head.appendChild(dragHandle); head.appendChild(checkbox); head.appendChild(toggle); head.appendChild(actions); article.appendChild(head);
    if (isOpen) article.appendChild(buildProjectDetail(project));
    return article;
  }

  function applyProjectCardColor(element, project) {
    applyProjectColorVars(element, getProjectColor(project));
    element.dataset.colorKey = getProjectColorKey(project);
  }

  function getProjectColor(project) {
    return getProjectColorByKey(getProjectColorKey(project));
  }

  function getProjectColorKey(project) {
    var requesterTags = splitTags(project.requester);
    return requesterTags[0] || project.title || project.id || '';
  }

  function getProjectColorByKey(colorKey) {
    return PROJECT_COLOR_PALETTE[tagHash(colorKey) % PROJECT_COLOR_PALETTE.length];
  }

  function applyProjectColorVars(element, color) {
    element.style.setProperty('--project-accent', color.accent);
    element.style.setProperty('--project-soft', color.soft);
    element.style.setProperty('--project-tint', color.tint);
  }

  function buildProjectCopy(project) {
    var copy = createElement('div', 'project-copy');
    var titleRow = createElement('div', 'title-row');
    titleRow.appendChild(createElement('h3', 'project-title', project.title));
    titleRow.appendChild(buildDueBadge(project));
    if (project.onHold && !project.done) titleRow.appendChild(createElement('span', 'state-badge hold-badge', '보류'));
    if (project.done) titleRow.appendChild(createElement('span', 'state-badge', '완료됨'));
    copy.appendChild(titleRow);
    var tagRow = createElement('div', 'tag-row');
    var hasTags = false;
    if (project.statusNote) { tagRow.appendChild(createElement('span', 'status-tag', '상태 · ' + project.statusNote)); hasTags = true; }
    splitTags(project.requester).forEach(function (name) { tagRow.appendChild(buildTagChip(name, 'requester-tag')); hasTags = true; });
    if (hasTags) copy.appendChild(tagRow);
    appendLinks(copy, project.relatedLinks);
    var meta = createElement('div', 'meta-row');
    var progress = getProgress(project);
    meta.appendChild(createElement('span', '', '등록일 ' + formatDate(project.createdAt)));
    meta.appendChild(createElement('span', '', progress.total === 0 ? '하위 업무 없음' : '하위 업무 ' + progress.done + '/' + progress.total + ' 완료'));
    meta.appendChild(createElement('span', '', getImportanceLabel(project.importance)));
    meta.appendChild(createElement('span', '', getDueModeLabel(project.dueMode)));
    var nextSubtaskDate = getNextSubtaskDue(project);
    if (project.dueMode !== 'date' && nextSubtaskDate) meta.appendChild(createElement('span', '', '가장 가까운 하위 일정 ' + formatDate(nextSubtaskDate)));
    if (project.dueMode === 'ongoing' && project.calendarRoutine) meta.appendChild(createElement('span', '', project.onHold ? '캘린더 반복 일시정지' : getRoutineScheduleLabel(project)));
    if (project.completedAt) meta.appendChild(createElement('span', '', '완료일 ' + formatDate(project.completedAt)));
    copy.appendChild(meta);
    return copy;
  }

  function buildProjectDetail(project) {
    var detail = createElement('div', 'project-detail');
    detail.appendChild(buildProjectDetailToolbar(project));
    if (state.quickEditOpen[project.id]) detail.appendChild(buildQuickProjectEditor(project));
    if (state.memoExpanded[project.id] && project.note) detail.appendChild(buildProjectMemo(project));
    if (project.subtasks.length === 0) { detail.appendChild(createElement('div', 'no-subtasks', '등록된 하위 업무가 없습니다.')); return detail; }
    var list = createElement('div', 'subtask-list');
    project.subtasks.slice().sort(function (a, b) { return compareSubtaskOrder(a, b, project); }).forEach(function (task) { list.appendChild(buildSubtaskRow(project, task)); });
    detail.appendChild(list);
    return detail;
  }

  function buildProjectDetailToolbar(project) {
    var toolbar = createElement('div', 'detail-toolbar');
    if (project.note) {
      var memoOpen = Boolean(state.memoExpanded[project.id]);
      var memoButton = createElement('button', 'detail-toggle-button memo-toggle-button');
      memoButton.type = 'button';
      if (memoOpen) memoButton.classList.add('is-open');
      memoButton.appendChild(svgIcon('chevron'));
      memoButton.appendChild(createElement('span', '', memoOpen ? '메모 접기' : '메모 보기'));
      memoButton.addEventListener('click', function () { toggleProjectMemo(project.id); });
      toolbar.appendChild(memoButton);
    } else {
      toolbar.appendChild(createElement('span', 'detail-muted', '메모 없음'));
    }
    var editOpen = Boolean(state.quickEditOpen[project.id]);
    var quickEditButton = createElement('button', 'detail-toggle-button quick-edit-toggle');
    quickEditButton.type = 'button';
    quickEditButton.appendChild(svgIcon('edit'));
    quickEditButton.appendChild(createElement('span', '', editOpen ? '수정 닫기' : '상태/메모 수정'));
    quickEditButton.addEventListener('click', function () { toggleQuickEdit(project.id); });
    toolbar.appendChild(quickEditButton);
    return toolbar;
  }

  function buildProjectMemo(project) {
    var panel = createElement('div', 'project-note-panel');
    panel.appendChild(createElement('span', 'project-note-label', '메모'));
    panel.appendChild(createElement('p', 'project-note', project.note));
    return panel;
  }

  function toggleProjectMemo(projectId) {
    state.memoExpanded[projectId] = !state.memoExpanded[projectId];
    render();
  }

  function toggleQuickEdit(projectId) {
    state.quickEditOpen[projectId] = !state.quickEditOpen[projectId];
    state.expanded[projectId] = true;
    render();
  }

  function buildQuickProjectEditor(project) {
    var panel = createElement('div', 'quick-edit-panel');
    var statusField = createElement('label', 'quick-field');
    var noteField = createElement('label', 'quick-field quick-note-field');
    var statusInput = createElement('input', 'quick-input');
    var noteInput = createElement('textarea', 'quick-note-input');
    statusInput.type = 'text';
    statusInput.maxLength = 120;
    statusInput.value = project.statusNote || '';
    statusInput.placeholder = '예: 피드백 반영 중, 자료 대기';
    noteInput.rows = 3;
    noteInput.maxLength = 800;
    noteInput.value = project.note || '';
    noteInput.placeholder = '업무 메모를 바로 적어두세요.';
    statusField.appendChild(createElement('span', '', '현재 상태'));
    statusField.appendChild(statusInput);
    noteField.appendChild(createElement('span', '', '메모'));
    noteField.appendChild(noteInput);
    var actions = createElement('div', 'quick-actions');
    var hint = createElement('span', 'quick-hint', '상태는 Enter, 메모는 Ctrl+Enter로 저장');
    var saveButton = createElement('button', 'quick-save-button');
    saveButton.type = 'button';
    saveButton.appendChild(svgIcon('save'));
    saveButton.appendChild(createElement('span', '', '저장'));
    saveButton.addEventListener('click', function () { saveQuickProjectUpdate(project.id, statusInput, noteInput); });
    statusInput.addEventListener('change', function () { saveQuickProjectUpdate(project.id, statusInput, noteInput, true); });
    noteInput.addEventListener('change', function () { saveQuickProjectUpdate(project.id, statusInput, noteInput, true); });
    statusInput.addEventListener('keydown', function (event) { if (event.key === 'Enter') { event.preventDefault(); saveQuickProjectUpdate(project.id, statusInput, noteInput); } });
    noteInput.addEventListener('keydown', function (event) { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); saveQuickProjectUpdate(project.id, statusInput, noteInput); } });
    actions.appendChild(saveButton);
    panel.appendChild(statusField);
    panel.appendChild(noteField);
    panel.appendChild(actions);
    panel.appendChild(hint);
    return panel;
  }

  function saveQuickProjectUpdate(projectId, statusInput, noteInput, silentNoChange) {
    var project = findProject(projectId);
    if (!project) return;
    var statusNote = statusInput.value.trim();
    var note = noteInput.value.trim();
    if (project.statusNote === statusNote && project.note === note) { if (!silentNoChange) showToast('변경된 내용이 없습니다.'); return; }
    var now = new Date().toISOString();
    project.statusNote = statusNote;
    project.note = note;
    project.updatedAt = now;
    saveState('업무 내용을 저장했습니다.');
    render();
  }

  function buildSubtaskRow(project, task) {
    var status = getDeadlineStatus(task, project);
    var row = createElement('div', 'subtask-row status-' + status.level);
    row.dataset.subtaskId = task.id;
    if (task.done) row.classList.add('is-done');
    if (isFocusedSubtask(project.id, task.id)) row.classList.add('is-focus-target');
    var checkbox = createElement('input', 'check-input'); checkbox.type = 'checkbox'; checkbox.checked = task.done; checkbox.setAttribute('aria-label', task.title + ' 완료 처리'); checkbox.addEventListener('change', function () { toggleSubtask(project.id, task.id, checkbox.checked); });
    var body = createElement('div', 'project-copy');
    var titleRow = createElement('div', 'title-row'); titleRow.appendChild(createElement('p', 'subtask-title', task.title)); titleRow.appendChild(buildDueBadge(task, project)); body.appendChild(titleRow);
    appendLinks(body, task.relatedLinks);
    var meta = createElement('div', 'meta-row'); meta.appendChild(createElement('span', '', '등록일 ' + formatDate(task.createdAt))); if (task.calendarRoutine) meta.appendChild(createElement('span', '', getRoutineScheduleLabel(task))); else if (!task.dueDate && getEffectiveSubtaskDue(task, project)) meta.appendChild(createElement('span', '', '상위 업무 기한 자동 적용')); if (task.completedAt) meta.appendChild(createElement('span', '', '완료일 ' + formatDate(task.completedAt))); body.appendChild(meta);
    if (task.note) body.appendChild(buildSubtaskMemo(project.id, task));
    var actions = createElement('div', 'subtask-actions');
    var editButton = iconButton('edit', '하위 업무 수정'); editButton.addEventListener('click', function () { openSubtaskDialog(project.id, task); }); actions.appendChild(editButton);
    var deleteButton = iconButton('trash', '하위 업무 삭제'); deleteButton.addEventListener('click', function () { openConfirm('선택한 하위 업무를 삭제합니다.', function () { project.subtasks = project.subtasks.filter(function (item) { return item.id !== task.id; }); project.updatedAt = new Date().toISOString(); saveState('하위 업무를 삭제했습니다.'); render(); }); }); actions.appendChild(deleteButton);
    row.appendChild(checkbox); row.appendChild(body); row.appendChild(actions);
    return row;
  }

  function isFocusedProject(projectId) {
    return state.focusTarget && state.focusTarget.projectId === projectId && !state.focusTarget.taskId;
  }

  function isFocusedSubtask(projectId, taskId) {
    return state.focusTarget && state.focusTarget.projectId === projectId && state.focusTarget.taskId === taskId;
  }

  function buildSubtaskMemo(projectId, task) {
    var wrapper = createElement('div', 'subtask-memo');
    var isOpen = Boolean(state.subtaskMemoExpanded[task.id]);
    var button = createElement('button', 'subtask-memo-toggle');
    button.type = 'button';
    if (isOpen) button.classList.add('is-open');
    button.appendChild(svgIcon('chevron'));
    button.appendChild(createElement('span', '', isOpen ? '메모 접기' : '메모 보기'));
    button.addEventListener('click', function () { toggleSubtaskMemo(projectId, task.id); });
    wrapper.appendChild(button);
    if (isOpen) wrapper.appendChild(createElement('p', 'subtask-note', task.note));
    return wrapper;
  }

  function toggleSubtaskMemo(projectId, taskId) {
    state.subtaskMemoExpanded[taskId] = !state.subtaskMemoExpanded[taskId];
    state.expanded[projectId] = true;
    render();
  }

  function renderFeedbackPage() {
    var query = state.search.trim().toLowerCase();
    var feedbacks = state.feedbacks.filter(function (item) { return !query || matchesFeedbackQuery(item, query); }).sort(function (a, b) { return dateStamp(b.createdAt) - dateStamp(a.createdAt); });
    els.feedbackResultCount.textContent = feedbacks.length + '개';
    els.feedbackList.replaceChildren();
    if (feedbacks.length === 0) { els.feedbackList.appendChild(buildEmptyState('정리된 피드백이 없습니다.')); return; }
    feedbacks.forEach(function (item) { els.feedbackList.appendChild(buildFeedbackCard(item)); });
  }

  function matchesFeedbackQuery(item, query) { return [item.category, item.content].some(function (value) { return matchesText(value, query); }); }

  function buildFeedbackCard(item) {
    var isOpen = Boolean(state.feedbackExpanded[item.id]);
    var card = createElement('article', 'feedback-card');
    if (isOpen) card.classList.add('is-open');
    var head = createElement('div', 'feedback-card-head');
    var title = createElement('div', 'feedback-title');
    var categoryTags = splitTags(item.category);
    title.appendChild(createElement('h3', '', categoryTags.length ? '피드백 메모' : '카테고리 없음'));
    if (categoryTags.length) { var tags = createElement('div', 'tag-row'); categoryTags.forEach(function (name) { tags.appendChild(buildTagChip(name, 'category-tag')); }); title.appendChild(tags); }
    var actions = createElement('div', 'project-actions');
    var toggleButton = iconButton('chevron', isOpen ? '피드백 접기' : '피드백 펼치기');
    toggleButton.classList.add('feedback-toggle');
    toggleButton.addEventListener('click', function () { toggleFeedback(item.id); });
    actions.appendChild(toggleButton);
    var editButton = iconButton('edit', '피드백 수정'); editButton.addEventListener('click', function () { editFeedback(item.id); }); actions.appendChild(editButton);
    var deleteButton = iconButton('trash', '피드백 삭제'); deleteButton.addEventListener('click', function () { openConfirm('선택한 피드백을 삭제합니다.', function () { state.feedbacks = state.feedbacks.filter(function (feedback) { return feedback.id !== item.id; }); saveState('피드백을 삭제했습니다.'); render(); }); }); actions.appendChild(deleteButton);
    head.appendChild(title); head.appendChild(actions); card.appendChild(head);
    var meta = createElement('div', 'meta-row'); meta.appendChild(createElement('span', '', '등록일 ' + formatDate(item.createdAt))); card.appendChild(meta);
    card.appendChild(createElement('p', isOpen ? 'feedback-content' : 'feedback-preview', isOpen ? item.content : makeFeedbackPreview(item.content)));
    return card;
  }

  function toggleFeedback(id) {
    state.feedbackExpanded[id] = !state.feedbackExpanded[id];
    renderFeedbackPage();
  }

  function makeFeedbackPreview(content) {
    var clean = String(content || '').replace(/\s+/g, ' ').trim();
    if (!clean) return '내용 없음';
    return clean.length > 140 ? clean.slice(0, 140) + '...' : clean;
  }

  function submitFeedbackForm(event) {
    event.preventDefault();
    var content = els.feedbackContent.value.trim();
    if (!content) { showToast('피드백 메모를 입력하세요.'); return; }
    var now = new Date().toISOString();
    var id = els.feedbackId.value;
    if (id) {
      var existing = state.feedbacks.find(function (item) { return item.id === id; });
      if (existing) { existing.category = normalizeTagsInput(els.feedbackCategory.value); existing.content = content; existing.updatedAt = now; }
      saveState('피드백을 수정했습니다.');
    } else {
      state.feedbacks.push({ id: createId(), category: normalizeTagsInput(els.feedbackCategory.value), content: content, createdAt: now, updatedAt: now });
      saveState('피드백을 저장했습니다.');
    }
    resetFeedbackForm();
    render();
  }

  function editFeedback(id) {
    var item = state.feedbacks.find(function (feedback) { return feedback.id === id; });
    if (!item) return;
    els.feedbackId.value = item.id; els.feedbackCategory.value = formatTagsForInput(item.category); els.feedbackContent.value = item.content || ''; els.feedbackFormTitle.textContent = '피드백 수정'; els.feedbackContent.focus();
  }

  function resetFeedbackForm() { if (!els.feedbackForm) return; els.feedbackId.value = ''; els.feedbackCategory.value = ''; els.feedbackContent.value = ''; els.feedbackFormTitle.textContent = '피드백 메모 추가'; }

  function buildEmptyState(text) { var empty = createElement('div', 'empty-state'); empty.appendChild(createElement('h3', '', text)); return empty; }
  function buildDueBadge(item, project) { var status = getDeadlineStatus(item, project); return createElement('span', 'due-badge status-' + status.level, status.text); }
  function getProjectUrgencyClass(project) {
    if (project.done) return '';
    var urgency = getProjectUrgency(project);
    if (urgency.diff < 0) return 'urgency-overdue';
    if (urgency.diff === 0) return 'urgency-today';
    if (urgency.diff === 1) return 'urgency-d1';
    if (urgency.diff === 2) return 'urgency-d2';
    return '';
  }
  function getDeadlineStatus(item, project) {
    if (item.done) return { level: 'done', text: '완료' };
    if (Object.prototype.hasOwnProperty.call(item, 'dueMode')) {
      if (item.dueMode === 'ongoing') return { level: 'timeline', text: '상시 진행' };
      if (item.dueMode === 'subtask') { var next = getNextSubtaskDue(item); return next ? deadlineStatusForDate(next, '하위 일정 · ') : { level: 'subtask', text: '하위 일정 기준' }; }
    }
    var effectiveDue = project ? getEffectiveSubtaskDue(item, project) : item.dueDate;
    if (!effectiveDue) return { level: 'none', text: '마감일 없음' };
    return deadlineStatusForDate(effectiveDue, project && !item.dueDate ? '상위 기한 · ' : formatDate(effectiveDue) + ' · ');
  }
  function deadlineStatusForDate(dateValue, prefix) { var diff = daysUntil(dateValue); if (diff < 0) return { level: 'critical', text: prefix + 'D+' + Math.abs(diff) }; if (diff === 0) return { level: 'critical', text: prefix + 'D-day' }; if (diff <= 3) return { level: 'soon', text: prefix + 'D-' + diff }; return { level: 'normal', text: prefix + 'D-' + diff }; }

  function openProjectDialog(project) {
    var isEdit = Boolean(project);
    var schedule = normalizeRoutineSchedule(isEdit ? project.routineSchedule : null, isEdit ? project.createdAt : new Date().toISOString(), isEdit ? Boolean(project.calendarRoutine) : false);
    els.projectDialogTitle.textContent = isEdit ? '프로젝트 수정' : '새 업무 추가';
    els.projectId.value = isEdit ? project.id : '';
    els.projectTitle.value = isEdit ? project.title : '';
    els.projectStatusNote.value = isEdit ? project.statusNote || '' : '';
    els.projectRequester.value = isEdit ? formatTagsForInput(project.requester) : '';
    els.projectImportance.value = isEdit ? normalizeProjectImportance(project.importance) : 'focus';
    els.projectDeadlineMode.value = isEdit ? project.dueMode || 'date' : 'date';
    els.projectDue.value = isEdit ? project.dueDate || '' : '';
    els.projectCalendarRoutine.checked = isEdit ? Boolean(project.calendarRoutine) : false;
    setRoutineScheduleInputs(schedule);
    els.projectLinks.value = isEdit ? project.relatedLinks || '' : '';
    els.projectNote.value = isEdit ? project.note || '' : '';
    updateDeadlineModeField();
    renderTagSuggestions();
    openDialog(els.projectDialog);
    els.projectTitle.focus();
  }
  function updateDeadlineModeField() {
    var isDateMode = els.projectDeadlineMode.value === 'date';
    var isOngoingMode = els.projectDeadlineMode.value === 'ongoing';
    var isRoutineMode = els.projectDeadlineMode.value === 'routine';
    var showRoutineOptions = isRoutineMode || (isOngoingMode && els.projectCalendarRoutine.checked);
    els.projectDueField.classList.toggle('is-hidden', !isDateMode);
    els.projectDue.disabled = !isDateMode;
    els.projectRoutineField.classList.toggle('is-hidden', !isOngoingMode);
    els.projectCalendarRoutine.disabled = !isOngoingMode;
    els.projectRoutineOptions.classList.toggle('is-hidden', !showRoutineOptions);
    els.projectRoutineStart.disabled = !showRoutineOptions;
    els.projectRoutineInterval.disabled = !showRoutineOptions;
    getRoutineWeekdayInputs().forEach(function (input) { input.disabled = !showRoutineOptions; });
    if (!isOngoingMode) els.projectCalendarRoutine.checked = false;
    if (isRoutineMode) els.projectCalendarRoutine.checked = true;
    if (showRoutineOptions && !els.projectRoutineStart.value) els.projectRoutineStart.value = todayStamp();
    updateRoutineFrequencyFields();
  }
  function setRoutineScheduleInputs(schedule) {
    els.projectRoutineStart.value = schedule.startDate || todayStamp();
    els.projectRoutineFrequency.value = schedule.frequency || 'weekly';
    els.projectRoutineMonthday.value = String(schedule.monthDay || Number((schedule.startDate || todayStamp()).slice(-2)));
    els.projectRoutineInterval.value = String(schedule.intervalWeeks || 1);
    var weekdays = schedule.weekdays || [1, 2, 3, 4, 5];
    getRoutineWeekdayInputs().forEach(function (input) { input.checked = weekdays.indexOf(Number(input.value)) >= 0; });
  }
  function updateRoutineFrequencyFields() {
    var isMonthly = els.projectRoutineFrequency.value === 'monthly';
    els.projectRoutineMonthdayField.classList.toggle('is-hidden', !isMonthly);
    els.projectRoutineMonthday.disabled = !isMonthly;
    els.projectRoutineIntervalField.classList.toggle('is-hidden', isMonthly);
    els.projectRoutineInterval.disabled = isMonthly;
    els.projectRoutineWeekdayField.classList.toggle('is-hidden', isMonthly);
    getRoutineWeekdayInputs().forEach(function (input) { input.disabled = isMonthly || els.projectRoutineOptions.classList.contains('is-hidden'); });
  }
  function getRoutineWeekdayInputs() {
    return Array.prototype.slice.call(els.projectRoutineWeekdays ? els.projectRoutineWeekdays.querySelectorAll('input[type="checkbox"]') : []);
  }
  function readRoutineScheduleFromForm(createdAt) {
    var weekdays = getRoutineWeekdayInputs().filter(function (input) { return input.checked; }).map(function (input) { return Number(input.value); });
    if (!weekdays.length) weekdays = [1, 2, 3, 4, 5];
    return normalizeRoutineSchedule({ startDate: els.projectRoutineStart.value || (createdAt ? createdAt.slice(0, 10) : todayStamp()), frequency: els.projectRoutineFrequency.value, monthDay: Number(els.projectRoutineMonthday.value), intervalWeeks: Number(els.projectRoutineInterval.value), weekdays: weekdays }, createdAt || new Date().toISOString(), true);
  }
  function submitProjectForm(event) {
    event.preventDefault();
    var title = els.projectTitle.value.trim();
    if (!title) { showToast('프로젝트명을 입력하세요.'); return; }
    var now = new Date().toISOString();
    var importance = normalizeProjectImportance(els.projectImportance.value);
    var dueMode = els.projectDeadlineMode.value;
    var dueDate = dueMode === 'date' ? els.projectDue.value : '';
    var calendarRoutine = dueMode === 'routine' || (dueMode === 'ongoing' && els.projectCalendarRoutine.checked);
    var id = els.projectId.value;
    if (id) {
      var project = findProject(id);
      if (project) {
        project.title = title;
        project.statusNote = els.projectStatusNote.value.trim();
        project.requester = normalizeTagsInput(els.projectRequester.value);
        project.importance = importance;
        project.dueMode = dueMode;
        project.dueDate = dueDate;
        project.calendarRoutine = calendarRoutine;
        project.routineSchedule = calendarRoutine ? readRoutineScheduleFromForm(project.createdAt) : normalizeRoutineSchedule(null, project.createdAt, false);
        project.relatedLinks = normalizeLinksText(els.projectLinks.value);
        project.note = els.projectNote.value.trim();
        project.updatedAt = now;
      }
      saveState('프로젝트를 수정했습니다.');
    } else {
      var newProject = { id: createId(), order: getNextOrder(importance), title: title, statusNote: els.projectStatusNote.value.trim(), requester: normalizeTagsInput(els.projectRequester.value), importance: importance, dueMode: dueMode, dueDate: dueDate, calendarRoutine: calendarRoutine, routineSchedule: calendarRoutine ? readRoutineScheduleFromForm(now) : normalizeRoutineSchedule(null, now, false), relatedLinks: normalizeLinksText(els.projectLinks.value), note: els.projectNote.value.trim(), dailyChecks: {}, done: false, onHold: false, completedAt: null, createdAt: now, updatedAt: now, subtasks: [] };
      state.projects.push(newProject);
      state.expanded[newProject.id] = true;
      saveState('새 업무를 추가했습니다.');
    }
    closeDialog(els.projectDialog); render();
  }
  function openSubtaskDialog(projectId, task) {
    var isEdit = Boolean(task);
    var schedule = normalizeRoutineSchedule(isEdit ? task.routineSchedule : null, isEdit ? task.createdAt : new Date().toISOString(), isEdit && Boolean(task.calendarRoutine));
    els.subtaskDialogTitle.textContent = isEdit ? '하위 업무 수정' : '하위 업무 추가';
    els.subtaskProjectId.value = projectId; els.subtaskId.value = isEdit ? task.id : '';
    els.subtaskTitle.value = isEdit ? task.title : ''; els.subtaskDue.value = isEdit ? task.dueDate || '' : '';
    els.subtaskRoutine.checked = isEdit && Boolean(task.calendarRoutine);
    els.subtaskRoutineStart.value = schedule.startDate || todayStamp();
    els.subtaskRoutineFrequency.value = schedule.frequency || 'weekly';
    els.subtaskRoutineMonthday.value = String(schedule.monthDay || Number((schedule.startDate || todayStamp()).slice(-2)));
    getSubtaskRoutineWeekdayInputs().forEach(function (input) { input.checked = schedule.weekdays.indexOf(Number(input.value)) >= 0; });
    els.subtaskLinks.value = isEdit ? task.relatedLinks || '' : ''; els.subtaskNote.value = isEdit ? task.note || '' : '';
    updateSubtaskRoutineFields(); openDialog(els.subtaskDialog); els.subtaskTitle.focus();
  }
  function getSubtaskRoutineWeekdayInputs() { return Array.prototype.slice.call(els.subtaskRoutineWeekdays.querySelectorAll('input[type="checkbox"]')); }
  function updateSubtaskRoutineFields() {
    var enabled = els.subtaskRoutine.checked;
    var monthly = els.subtaskRoutineFrequency.value === 'monthly';
    els.subtaskDueField.classList.toggle('is-hidden', enabled);
    els.subtaskDue.disabled = enabled;
    if (enabled) els.subtaskDue.value = '';
    els.subtaskRoutineOptions.classList.toggle('is-hidden', !enabled);
    els.subtaskRoutineMonthdayField.classList.toggle('is-hidden', !enabled || !monthly);
    els.subtaskRoutineWeekdayField.classList.toggle('is-hidden', !enabled || monthly);
    els.subtaskRoutineStart.disabled = !enabled; els.subtaskRoutineFrequency.disabled = !enabled; els.subtaskRoutineMonthday.disabled = !enabled || !monthly;
    getSubtaskRoutineWeekdayInputs().forEach(function (input) { input.disabled = !enabled || monthly; });
  }
  function readSubtaskRoutineSchedule(createdAt) {
    var weekdays = getSubtaskRoutineWeekdayInputs().filter(function (input) { return input.checked; }).map(function (input) { return Number(input.value); });
    return normalizeRoutineSchedule({ startDate: els.subtaskRoutineStart.value || todayStamp(), frequency: els.subtaskRoutineFrequency.value, monthDay: Number(els.subtaskRoutineMonthday.value), weekdays: weekdays }, createdAt, true);
  }
  function submitSubtaskForm(event) {
    event.preventDefault(); var project = findProject(els.subtaskProjectId.value); var title = els.subtaskTitle.value.trim();
    if (!project || !title) { showToast('하위 업무명을 입력하세요.'); return; }
    var now = new Date().toISOString(); var subtaskId = els.subtaskId.value; var note = els.subtaskNote.value.trim(); var routine = els.subtaskRoutine.checked;
    if (subtaskId) {
      var task = project.subtasks.find(function (item) { return item.id === subtaskId; });
      if (task) { task.title = title; task.dueDate = routine ? '' : els.subtaskDue.value; task.calendarRoutine = routine; task.routineSchedule = routine ? readSubtaskRoutineSchedule(task.createdAt) : normalizeRoutineSchedule(null, task.createdAt, false); task.relatedLinks = normalizeLinksText(els.subtaskLinks.value); task.note = note; task.updatedAt = now; }
      saveState('하위 업무를 수정했습니다.');
    } else {
      var newTask = { id: createId(), title: title, dueDate: routine ? '' : els.subtaskDue.value, calendarRoutine: routine, routineSchedule: routine ? readSubtaskRoutineSchedule(now) : normalizeRoutineSchedule(null, now, false), dailyChecks: {}, relatedLinks: normalizeLinksText(els.subtaskLinks.value), note: note, done: false, completedAt: null, createdAt: now, updatedAt: now };
      project.subtasks.push(newTask); if (note) state.subtaskMemoExpanded[newTask.id] = true; state.expanded[project.id] = true; saveState('하위 업무를 추가했습니다.');
    }
    project.updatedAt = now; closeDialog(els.subtaskDialog); render();
  }
  function toggleProject(projectId, isDone) { var project = findProject(projectId); if (!project) return; var now = new Date().toISOString(); project.done = isDone; project.onHold = false; project.completedAt = isDone ? now : null; project.updatedAt = now; project.order = getNextOrder(getProjectListGroup(project)); saveState(isDone ? '완료함으로 이동했습니다.' : '진행 중으로 되돌렸습니다.'); render(); }
  function toggleProjectHold(projectId) {
    var project = findProject(projectId);
    if (!project || project.done) return;
    var now = new Date().toISOString();
    project.onHold = !project.onHold;
    project.updatedAt = now;
    project.order = getNextOrder(getProjectListGroup(project));
    saveState(project.onHold ? '보류로 이동했습니다.' : '진행 중으로 이동했습니다.');
    render();
  }

  function toggleSubtask(projectId, taskId, isDone) { var project = findProject(projectId); if (!project) return; var task = project.subtasks.find(function (item) { return item.id === taskId; }); if (!task) return; var now = new Date().toISOString(); task.done = isDone; task.completedAt = isDone ? now : null; task.updatedAt = now; project.updatedAt = now; saveState(isDone ? '하위 업무를 완료했습니다.' : '하위 업무 완료를 해제했습니다.'); render(); }

  function ensureProjectOrder() {
    state.projects.forEach(function (project, index) { if (typeof project.order !== 'number' || !Number.isFinite(project.order)) project.order = index; });
  }

  function getNextOrder(groupName) {
    var group = state.projects.filter(function (project) { return groupName ? getProjectListGroup(project) === groupName : true; });
    if (!group.length) return 0;
    return Math.max.apply(Math, group.map(function (project) { return typeof project.order === 'number' ? project.order : 0; })) + 1;
  }

  function normalizeManualOrderPreference(value, legacyManual) {
    if (value && typeof value === 'object') return { focus: Boolean(value.focus || value.active), later: Boolean(value.later), hold: Boolean(value.hold), recurring: Boolean(value.recurring), archived: Boolean(value.archived) };
    return { focus: Boolean(legacyManual), later: false, hold: false, recurring: false, archived: false };
  }

  function setupDashboardDropZones() {
    ['focusTaskList','laterTaskList','holdTaskList','recurringTaskList','archiveTaskList'].forEach(function (id) {
      var list = els[id];
      if (!list) return;
      list.addEventListener('dragover', function (event) { handleTaskListDragOver(event, list.dataset.dashboardGroup); });
      list.addEventListener('dragleave', function (event) { if (!list.contains(event.relatedTarget)) list.classList.remove('is-drop-target'); });
      list.addEventListener('drop', function (event) { handleTaskListDrop(event, list.dataset.dashboardGroup); });
      var column = list.closest('.board-column');
      if (column) {
        column.addEventListener('dragover', function (event) { handleTaskListDragOver(event, list.dataset.dashboardGroup); });
        column.addEventListener('drop', function (event) { handleTaskListDrop(event, list.dataset.dashboardGroup); });
      }
    });
  }

  function shouldBlockProjectDrag(target) {
    return Boolean(target && target.closest && target.closest('input, textarea, select, a, .project-actions, .project-detail, .subtask-actions, .quick-edit-panel, .detail-toolbar, .subtask-memo'));
  }

  function startProjectDrag(event, projectId) {
    state.dragProjectId = projectId;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', projectId);
    }
    var card = event.currentTarget.closest('.project-item');
    if (card) card.classList.add('is-dragging');
  }

  function handleProjectDragOver(event, targetId) {
    if (!state.dragProjectId || state.dragProjectId === targetId) return;
    var source = findProject(state.dragProjectId);
    var target = findProject(targetId);
    if (!source || !target) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    var card = event.currentTarget;
    document.querySelectorAll('.project-item.drop-before, .project-item.drop-after').forEach(function (item) { if (item !== card) item.classList.remove('drop-before', 'drop-after'); });
    document.querySelectorAll('.task-list.is-drop-target').forEach(function (item) { item.classList.remove('is-drop-target'); });
    var rect = card.getBoundingClientRect();
    var after = event.clientY > rect.top + rect.height / 2;
    card.classList.toggle('drop-before', !after);
    card.classList.toggle('drop-after', after);
  }

  function handleProjectDrop(event, targetId) {
    if (!state.dragProjectId) return;
    event.preventDefault();
    event.stopPropagation();
    var target = findProject(targetId);
    if (!target) return;
    var insertAfter = event.currentTarget.classList.contains('drop-after');
    var moved = moveProjectByDrop(state.dragProjectId, getProjectListGroup(target), targetId, insertAfter);
    clearProjectDragState();
    if (moved) { saveState('업무 위치를 옮겼습니다.'); render(); }
  }

  function handleTaskListDragOver(event, targetGroup) {
    if (!state.dragProjectId || !targetGroup) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.project-item.drop-before, .project-item.drop-after').forEach(function (item) { item.classList.remove('drop-before', 'drop-after'); });
    var list = getTaskListForGroup(targetGroup) || event.currentTarget;
    list.classList.add('is-drop-target');
  }

  function handleTaskListDrop(event, targetGroup) {
    if (!state.dragProjectId || !targetGroup) return;
    event.preventDefault();
    event.stopPropagation();
    var targetCard = event.target.closest ? event.target.closest('.project-item') : null;
    var targetId = targetCard ? targetCard.dataset.projectId || '' : '';
    var insertAfter = true;
    if (targetCard) {
      var rect = targetCard.getBoundingClientRect();
      insertAfter = event.clientY > rect.top + rect.height / 2;
    }
    var moved = moveProjectByDrop(state.dragProjectId, targetGroup, targetId, insertAfter);
    clearProjectDragState();
    if (moved) { saveState('업무 위치를 옮겼습니다.'); render(); }
  }

  function getTaskListForGroup(groupName) {
    var map = { focus: 'focusTaskList', later: 'laterTaskList', hold: 'holdTaskList', recurring: 'recurringTaskList', archived: 'archiveTaskList' };
    return els[map[groupName]];
  }

  function moveProjectByDrop(sourceId, targetGroup, targetId, insertAfter) {
    var source = findProject(sourceId);
    if (!source || !isDashboardGroup(targetGroup)) return false;
    var sourceGroup = getProjectListGroup(source);
    if ((sourceGroup === 'recurring') !== (targetGroup === 'recurring')) return false;
    var target = targetId ? findProject(targetId) : null;
    if (targetId && (!target || getProjectListGroup(target) !== targetGroup)) return false;
    if (source.id === targetId && sourceGroup === targetGroup) return false;
    var now = new Date().toISOString();
    applyProjectDashboardGroup(source, targetGroup, now);
    var group = state.projects.filter(function (item) { return item.id !== source.id && getProjectListGroup(item) === targetGroup; }).sort(function (a, b) { return compareProjectOrder(a, b, targetGroup); });
    if (targetId) {
      var targetIndex = group.findIndex(function (item) { return item.id === targetId; });
      if (targetIndex < 0) return false;
      group.splice(insertAfter ? targetIndex + 1 : targetIndex, 0, source);
    } else {
      group.push(source);
    }
    group.forEach(function (item, index) { item.order = index; });
    reindexProjectGroup(sourceGroup);
    setManualOrder(targetGroup, true);
    if (sourceGroup !== targetGroup) setManualOrder(sourceGroup, true);
    return true;
  }

  function applyProjectDashboardGroup(project, targetGroup, now) {
    if (targetGroup === 'archived') {
      project.done = true;
      project.onHold = false;
      project.completedAt = project.completedAt || now;
    } else {
      project.done = false;
      project.completedAt = null;
      project.onHold = targetGroup === 'hold';
      if (targetGroup === 'focus' || targetGroup === 'later') project.importance = targetGroup;
    }
    project.updatedAt = now;
  }

  function reindexProjectGroup(groupName) {
    if (!isDashboardGroup(groupName)) return;
    state.projects.filter(function (item) { return getProjectListGroup(item) === groupName; }).sort(function (a, b) { return compareProjectOrder(a, b, groupName); }).forEach(function (item, index) { item.order = index; });
  }

  function isDashboardGroup(groupName) {
    return ['focus','later','hold','recurring','archived'].indexOf(groupName) >= 0;
  }

  function clearProjectDragState() {
    state.dragProjectId = null;
    document.querySelectorAll('.project-item.is-dragging, .project-item.drop-before, .project-item.drop-after').forEach(function (item) {
      item.classList.remove('is-dragging', 'drop-before', 'drop-after');
    });
    document.querySelectorAll('.task-list.is-drop-target').forEach(function (item) { item.classList.remove('is-drop-target'); });
  }

  function exportCsv() {
    var headers = ['구분','순서','상위 프로젝트 ID','프로젝트명','현재 상태','업무 준 사람','마감 유형','항목 ID','제목','메모/내용','관련 링크','마감일/적용기한','완료 여부/카테고리','등록일','완료일','수정일'];
    var rows = [headers];
    state.projects.forEach(function (project) {
      rows.push(['프로젝트', project.order, '',project.title,project.statusNote || '',project.requester || '',getDueModeLabel(project.dueMode),project.id,project.title,project.note || '',project.relatedLinks || '',project.dueDate || '',getProjectStateLabel(project),formatDateTime(project.createdAt),project.completedAt ? formatDateTime(project.completedAt) : '',formatDateTime(project.updatedAt)]);
      Object.keys(project.dailyChecks || {}).sort().forEach(function (date) {
        var checkedAt = project.dailyChecks[date];
        rows.push(['상시 체크', '', project.id,project.title,project.statusNote || '',project.requester || '',getRoutineScheduleLabel(project),project.id + ':' + date,project.title,project.note || '',project.relatedLinks || '',date,'완료',formatDateTime(project.createdAt),typeof checkedAt === 'string' ? formatDateTime(checkedAt) : '',formatDateTime(project.updatedAt)]);
      });
      project.subtasks.forEach(function (task) {
        rows.push(['하위 업무', '', project.id,project.title,project.statusNote || '',project.requester || '','하위 업무 마감일',task.id,task.title,task.note || '',task.relatedLinks || '',getEffectiveSubtaskDue(task, project) || '',task.done ? '완료' : (project.onHold ? '상위 업무 보류' : '진행 중'),formatDateTime(task.createdAt),task.completedAt ? formatDateTime(task.completedAt) : '',formatDateTime(task.updatedAt)]);
      });
    });
    state.feedbacks.forEach(function (item) { rows.push(['피드백','','','','','','피드백 정리',item.id,item.category || '',item.content || '','', '', item.category || '', formatDateTime(item.createdAt), '', formatDateTime(item.updatedAt)]); });
    var csv = String.fromCharCode(0xfeff) + rows.map(function (row) { return row.map(csvCell).join(','); }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); var url = URL.createObjectURL(blob); var link = document.createElement('a'); link.href = url; link.download = 'local_tasks_' + todayStamp() + '.csv'; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url); showToast('CSV 파일을 만들었습니다.');
  }

  function appendLinks(container, text) { var links = parseLinks(text); if (!links.length) return; var list = createElement('div', 'link-list'); links.forEach(function (link) { var anchor = createElement('a', 'link-chip', displayLink(link)); anchor.href = normalizeHref(link); anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; list.appendChild(anchor); }); container.appendChild(list); }
  function parseLinks(text) { return String(text || '').split(/[\n,]+/).map(function (item) { return item.trim(); }).filter(Boolean); }
  function normalizeLinksText(text) { return parseLinks(text).join('\n'); }
  function normalizeHref(link) { if (/^(https?:|file:|mailto:|tel:)/i.test(link)) return link; return 'https://' + link; }
  function displayLink(link) { return link.replace(/^(https?:\/\/)/i, '').replace(/\/$/, '').slice(0, 56); }
  function getEffectiveSubtaskDue(task, project) { return task.dueDate || (project && project.dueMode === 'date' ? project.dueDate || '' : ''); }
  function csvCell(value) { var text = value == null ? '' : String(value); return '"' + text.replace(/"/g, '""') + '"'; }
  function openConfirm(message, action) { els.confirmMessage.textContent = message; pendingConfirm = action; openDialog(els.confirmDialog); }
  function openDialog(dialog) { if (dialog && typeof dialog.showModal === 'function') dialog.showModal(); else if (dialog) dialog.setAttribute('open', ''); }
  function closeDialog(dialog) { if (dialog && typeof dialog.close === 'function') dialog.close(); else if (dialog) dialog.removeAttribute('open'); }
  function showToast(message) { els.toast.textContent = message; els.toast.classList.add('is-visible'); window.clearTimeout(toastTimer); toastTimer = window.setTimeout(function () { els.toast.classList.remove('is-visible'); }, 1800); }
  function setStorageStatus(message, isError) { els.storageStatus.textContent = message; els.storageDot.classList.toggle('is-error', Boolean(isError)); }
  function findProject(projectId) { return state.projects.find(function (project) { return project.id === projectId; }); }
  function matchesText(value, query) {
    var text = String(value || '').toLowerCase();
    var cleanQuery = String(query || '').replace(/^#+/, '').toLowerCase();
    return text.indexOf(String(query || '').toLowerCase()) >= 0 || (cleanQuery && text.indexOf(cleanQuery) >= 0);
  }
  function splitTags(value) {
    var seen = {};
    return String(value || '').split(/[\n,;，、]+/).map(normalizeTagName).filter(Boolean).filter(function (tag) {
      var key = tag.toLowerCase();
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }
  function normalizeTagName(value) { return String(value || '').trim().replace(/^#+/, '').replace(/\s+/g, ' '); }
  function normalizeTagsInput(value) { return splitTags(value).join('\n'); }
  function formatTagsForInput(value) { return splitTags(value).map(function (tag) { return '#' + tag; }).join('\n'); }
  function setupTagInput(input) {
    if (!input) return;
    input.addEventListener('blur', function () { input.value = formatTagsForInput(input.value); });
  }
  function buildTagChip(tag, className) {
    var chip = createElement('span', 'tag-chip ' + (className || ''), '#' + tag);
    if (String(className || '').split(/\s+/).indexOf('requester-tag') >= 0) applyRequesterTagColor(chip, tag);
    else applyTagColor(chip, tag);
    return chip;
  }
  function applyRequesterTagColor(element, tag) {
    var color = getProjectColorByKey(tag);
    applyProjectColorVars(element, color);
    element.style.background = color.soft;
    element.style.borderColor = color.accent;
    element.style.color = 'color-mix(in srgb, ' + color.accent + ' 60%, #000)';
  }
  function applyTagColor(element, tag) {
    var color = TAG_PALETTE[tagHash(tag) % TAG_PALETTE.length];
    element.style.background = color.bg;
    element.style.borderColor = color.border;
    element.style.color = color.text;
  }
  function tagHash(tag) {
    var text = String(tag || '').toLowerCase();
    var hash = 0;
    for (var index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
    return hash;
  }
  function renderTagSuggestions() {
    renderSuggestionList(els.projectRequesterSuggestions, collectRequesterTags(), els.projectRequester);
    renderSuggestionList(els.feedbackCategorySuggestions, collectFeedbackTags(), els.feedbackCategory);
  }
  function renderSuggestionList(container, tags, input) {
    if (!container) return;
    var useRequesterColor = container === els.projectRequesterSuggestions;
    container.replaceChildren();
    tags.slice(0, 18).forEach(function (tag) {
      var button = createElement('button', 'saved-tag tag-chip' + (useRequesterColor ? ' requester-tag' : ''), '#' + tag);
      button.type = 'button';
      if (useRequesterColor) applyRequesterTagColor(button, tag);
      else applyTagColor(button, tag);
      button.addEventListener('click', function () { addTagToInput(input, tag); });
      container.appendChild(button);
    });
  }
  function addTagToInput(input, tag) {
    if (!input) return;
    var tags = splitTags(input.value);
    if (!tags.some(function (item) { return item.toLowerCase() === tag.toLowerCase(); })) tags.push(tag);
    input.value = tags.map(function (item) { return '#' + item; }).join('\n');
    input.focus();
  }
  function collectRequesterTags() { return collectTagsFrom(state.projects.map(function (project) { return project.requester; })); }
  function collectFeedbackTags() { return collectTagsFrom(state.feedbacks.map(function (item) { return item.category; })); }
  function collectTagsFrom(values) {
    var map = {};
    values.forEach(function (value) { splitTags(value).forEach(function (tag) { var key = tag.toLowerCase(); if (!map[key]) map[key] = tag; }); });
    return Object.keys(map).sort().map(function (key) { return map[key]; });
  }
  function getProjectStateLabel(project) { if (project.done) return '완료'; if (project.onHold) return '보류'; return getImportanceLabel(project.importance); }
  function getProgress(project) { var total = project.subtasks.length; var done = project.subtasks.filter(function (task) { return task.done; }).length; return { total: total, done: done }; }
  function getDueModeLabel(mode) { if (mode === 'routine') return '반복 업무'; if (mode === 'ongoing') return '상시 진행'; if (mode === 'subtask') return '하위 업무 일정 기준'; return '특정 마감일'; }
  function compareSubtaskOrder(a, b, project) {
    return createdDayStamp(b.createdAt) - createdDayStamp(a.createdAt) ||
      dueStamp(getEffectiveSubtaskDue(a, project)) - dueStamp(getEffectiveSubtaskDue(b, project)) ||
      dateStamp(b.createdAt) - dateStamp(a.createdAt) ||
      a.title.localeCompare(b.title);
  }
  function getRoutineScheduleLabel(project) {
    var schedule = normalizeRoutineSchedule(project.routineSchedule, project.createdAt, project.calendarRoutine);
    var names = ['일', '월', '화', '수', '목', '금', '토'];
    if (schedule.frequency === 'monthly') return '매달 ' + schedule.monthDay + '일 반복';
    var days = schedule.weekdays.map(function (day) { return names[day]; }).join('/');
    return (schedule.intervalWeeks === 2 ? '격주 ' : '매주 ') + days + ' 반복';
  }
  function getNextSubtaskDue(project) { var dates = project.subtasks.filter(function (task) { return !task.done && getEffectiveSubtaskDue(task, project); }).map(function (task) { return getEffectiveSubtaskDue(task, project); }).sort(); return dates[0] || ''; }
  function earliestDueStamp(project) { var stamps = []; if (project.dueMode === 'date' && project.dueDate) stamps.push(dueStamp(project.dueDate)); project.subtasks.forEach(function (task) { var due = getEffectiveSubtaskDue(task, project); if (!task.done && due) stamps.push(dueStamp(due)); }); return stamps.length ? Math.min.apply(Math, stamps) : Number.POSITIVE_INFINITY; }
  function dueStamp(dateValue) { return dateValue ? new Date(dateValue + 'T00:00:00').getTime() : Number.POSITIVE_INFINITY; }
  function dateStamp(value) { return value ? new Date(value).getTime() : 0; }
  function createdDayStamp(value) { var date = value ? new Date(value) : null; if (!date || Number.isNaN(date.getTime())) return 0; return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(); }
  function daysUntilStamp(stamp) { var now = new Date(); var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); return Math.round((stamp - today.getTime()) / 86400000); }
  function daysUntil(dateValue) { var target = new Date(dateValue + 'T00:00:00'); var now = new Date(); var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); return Math.round((target.getTime() - today.getTime()) / 86400000); }
  function formatDate(value) { if (!value) return ''; var date = value.indexOf('T') >= 0 ? new Date(value) : new Date(value + 'T00:00:00'); if (Number.isNaN(date.getTime())) return ''; return date.getFullYear() + '.' + pad(date.getMonth() + 1) + '.' + pad(date.getDate()); }
  function formatDateTime(value) { if (!value) return ''; var date = new Date(value); if (Number.isNaN(date.getTime())) return ''; return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes()); }
  function todayStamp() { var now = new Date(); return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()); }

  function getCurrentMonthStamp() { return todayStamp().slice(0, 7); }
  function parseMonthStamp(month) { var parts = month.split('-'); return new Date(Number(parts[0]), Number(parts[1]) - 1, 1); }
  function offsetMonthStamp(month, delta) { var date = parseMonthStamp(month); date.setMonth(date.getMonth() + delta); return date.getFullYear() + '-' + pad(date.getMonth() + 1); }
  function dateToStamp(date) { return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()); }
  function dateToMonthStamp(date) { return date.getFullYear() + '-' + pad(date.getMonth() + 1); }
  function formatCalendarMonth(month) { var date = parseMonthStamp(month); return date.getFullYear() + '년 ' + (date.getMonth() + 1) + '월'; }
  function formatCalendarShortDate(value) { var date = new Date(value + 'T00:00:00'); return (date.getMonth() + 1) + '/' + date.getDate() + ' (' + ['일','월','화','수','목','금','토'][date.getDay()] + ')'; }
  function pad(value) { return String(value).padStart(2, '0'); }
  function createId() { return window.crypto && typeof window.crypto.randomUUID === 'function' ? window.crypto.randomUUID() : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9); }
  function createElement(tagName, className, text) { var element = document.createElement(tagName); if (className) element.className = className; if (text != null) element.textContent = text; return element; }
  function iconButton(iconName, label) { var button = createElement('button', 'icon-button'); button.type = 'button'; button.title = label; button.setAttribute('aria-label', label); button.appendChild(svgIcon(iconName)); return button; }
  function svgIcon(name, className) { var namespace = 'http://www.w3.org/2000/svg'; var svg = document.createElementNS(namespace, 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); if (className) svg.setAttribute('class', className); var pathData = { chevron: ['M9 18l6-6-6-6'], save: ['M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z', 'M17 21v-8H7v8', 'M7 3v5h8'], grip: ['M9 5h.01', 'M15 5h.01', 'M9 12h.01', 'M15 12h.01', 'M9 19h.01', 'M15 19h.01'], up: ['M12 19V5', 'M6 11l6-6 6 6'], down: ['M12 5v14', 'M6 13l6 6 6-6'], plus: ['M12 5v14', 'M5 12h14'], edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z'], pause: ['M8 5v14', 'M16 5v14'], play: ['M8 5v14l11-7-11-7Z'], trash: ['M3 6h18', 'M8 6V4h8v2', 'M6 6l1 15h10l1-15', 'M10 11v6', 'M14 11v6'] }; (pathData[name] || pathData.plus).forEach(function (data) { var path = document.createElementNS(namespace, 'path'); path.setAttribute('d', data); svg.appendChild(path); }); return svg; }
})();
