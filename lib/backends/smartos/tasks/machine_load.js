/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2018, Joyent, Inc.
 */

var Task = require('../../../task_agent/task');
var vmadm = require('vmadm');
var execFile = require('child_process').execFile;
var common = require('../common');

var MachineLoadTask = module.exports = function (req) {
    Task.call(this);
    this.req = req;
};

Task.createTask(MachineLoadTask);

function start(callback) {
    var self = this;
    var opts = {};

    opts.log = self.log;
    opts.req_id = self.req.req_id;
    opts.uuid = self.req.params.uuid;
    opts.vmadmLogger = common.makeVmadmLogger(self);

    vmadm.load(opts, function (error, machine) {
        if (error) {
            var msg = error instanceof Error ? error.message : error;
            if (error.restCode) {
                self.fatal('VM.load error: ' + msg,
                    { restCode: error.restCode });
            } else {
                self.fatal('VM.load error: ' + msg);
            }
            return;
        }
        self.finish(machine);
    });
}

MachineLoadTask.setStart(start);
