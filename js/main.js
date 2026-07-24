/**
 * main.js
 * ------------------------------------------------------------
 * Coldcard Web Simulator — entry point.
 *
 * As of the multi-device update, this file does almost nothing:
 * all the interesting wiring (creating instances, shared keyboard
 * focus, the render loop) lives in core/workspace.js. That's by
 * design — main.js should stay a thin bootstrap so it's obvious
 * at a glance where every piece of behavior actually lives.
 */

import { Workspace } from './core/workspace.js';

function main() {
  new Workspace({
    workspaceEl: document.getElementById('workspace'),
    template: document.getElementById('device-template'),
    addButtonEl: document.getElementById('add-device-btn'),
  });
}

document.addEventListener('DOMContentLoaded', main);
