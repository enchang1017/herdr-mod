import { errorText } from "./acli.js";
import { listBoards, resolveBoard, matchBoards } from "./board-source.js";
import { chooseBoard, boardId } from "./settings.js";
import { forgetBoard } from "./data.js";
import { NO_FILTER, loadBoard } from "./board-controller.js";

const CLOSED = null;

function patchPicker(app, patch) {
  if (app.state.picker) app.set({ picker: Object.freeze({ ...app.state.picker, ...patch }) });
}

export function pickerRows(app) {
  return matchBoards(app.state.picker?.boards ?? [], app.pickerInput.value());
}

function currentIndex(boards) {
  return Math.max(0, boards.findIndex((one) => one.id === boardId()));
}

export function openPicker(app, cx) {
  if (app.state.picker) return true;
  app.pickerInput.set_value("");
  app.set({ picker: Object.freeze({ loading: true, saving: false, error: "", boards: Object.freeze([]), index: 0 }) });
  app.pickerInput.focus();
  cx.spawn(async (cx) => {
    try {
      const boards = await listBoards(false);
      patchPicker(app, { boards, index: currentIndex(boards), error: "" });
    } catch (e) {
      patchPicker(app, { error: errorText(e) });
    } finally {
      patchPicker(app, { loading: false });
      cx.notify();
    }
  });
  cx.notify();
  return true;
}

export function closePicker(app, cx) {
  app.set({ picker: CLOSED });
  app.blur(cx);
  return true;
}

export function filterChanged(app, cx) {
  patchPicker(app, { index: 0 });
  cx.notify();
}

export function movePick(app, step, cx) {
  const count = pickerRows(app).length;
  if (!count) return true;
  patchPicker(app, { index: Math.max(0, Math.min(count - 1, (app.state.picker?.index ?? 0) + step)) });
  cx.notify();
  return true;
}

export function chooseHighlighted(app, cx) {
  const board = pickerRows(app)[app.state.picker?.index ?? 0];
  if (board) choose(app, board, cx);
  return true;
}

function resetBoardState(app) {
  forgetBoard();
  app.set({ boardEntry: null, boardFilter: NO_FILTER, collapsed: Object.freeze([]), selected: null, boardScroll: 0, labelFocus: null, rows: [], at: 0 });
}

export function choose(app, board, cx) {
  if (app.state.picker?.saving) return;
  patchPicker(app, { saving: true, error: "" });
  cx.spawn(async (cx) => {
    try {
      await chooseBoard(board.id);
      await resolveBoard(true);
      resetBoardState(app);
      closePicker(app, cx);
      app.set({ message: `Board: ${board.name}` });
      app.persist();
      if (app.state.view === "board") loadBoard(app, cx, true);
      else app.pickView("board", cx);
    } catch (e) {
      patchPicker(app, { saving: false, error: `Could not switch to ${board.name}: ${errorText(e)}` });
    } finally {
      cx.notify();
    }
  });
  cx.notify();
}
