/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2018, Joyent, Inc.
 */

/*
 *
 * Common functions that don't belong anywhese else.
 *
 */

var assert = require('assert-plus');
var execFile = require('child_process').execFile;
var fs = require('fs');

var async = require('async');
var EffluentLogger = require('effluent-logger');
var verror = require('verror');

var FIELDS = 'zoneid:zonename:state:zonepath:uuid:brand:ip-type'.split(':');

function parseZoneList(data) {
    var zones = {};
    var lines = data.trim().split('\n');
    var i = lines.length;
    var j;
    var zone;
    var fieldsLength = FIELDS.length;

    while (i--) {
        var lineParts = lines[i].split(':');
        var zoneName = lineParts[1];
        j = fieldsLength;
        zones[zoneName] = zone = {};

        while (j--) {
            zone[FIELDS[j]] = lineParts[j];
        }
    }

    return zones;
}

function zoneList(name, callback) {
    var args = [ 'list', '-pc' ];

    if (name) {
        args.push(name);
    }

    execFile('/usr/sbin/zoneadm', args, function (error, stdout, stderr) {
        if (error) {
            return callback(error);
        }
        return callback(null, parseZoneList(stdout));
    });
}

function modifyConfig(configPath, key, value, callback) {
    var out = [];
    var found = false;

    fs.readFile(configPath, 'utf8', function (error, data) {
        data.toString().split('\n').forEach(function (l) {
            var idx = l.indexOf('=');
            var lk = l.slice(0, idx);

            if (lk === 'overprovision_ratio') {
                found = true;
                out.push('overprovision_ratio=\''+value+'\'');
            } else {
                out.push(l);
            }
        });

        if (!found) {
            out.push('overprovision_ratio=\''+value+'\'');
        }

        fs.writeFile(configPath, out.join('\n'), 'utf8', function (writeError) {
            callback(writeError);
        });
    });
}

function zoneadm(zone, addtlArgs, opts, callback) {
    assert.uuid(zone, 'zone');
    assert.arrayOfString(addtlArgs, 'addtlArgs');
    assert.object(opts.log, 'opts.log');
    assert.func(callback, 'callback');

    var args = ['-z', zone];
    args.push.apply(args, addtlArgs);
    execFile('/usr/sbin/zoneadm', args, { encoding: 'utf8' },
        function (error, stderr, stdout) {
            if (error) {
                if (stderr) {
                    opts.log.warn('zoneadm stderr: %s',
                        stderr.toString().trim());
                }

                callback(
                    new verror.WError(
                        error,
                        'Error running zoneadm '
                        + addtlArgs.join(' ')
                        + ' on zone'));
                return;
            }
            callback();
            return;
        });
}
/*
 * Create a logger for re-logging vmadm log messages.
 *
 * These messages will currently be sent to fluentd if one is configured.
 *
 */
function makeVmadmLogger(task) {
    var evtLogger;

    if (process.env.FLUENTD_HOST) {
        evtLogger = new EffluentLogger({
            filter: function _evtFilter(obj) { return (!!obj.evt); },
            host: process.env.FLUENTD_HOST,
            log: task.log,
            port: 24224,
            tag: 'debug'
        });
        return evtLogger;
    }

    return null;
}

function provisionInProgressFile(uuidOrZonename, callback) {
    var filename = '/var/tmp/machine-provision-' + uuidOrZonename;
    fs.writeFile(filename, '', function (error) {
        return callback(error, filename);
    });
}

function ensureProvisionComplete(uuid, callback) {
    var filename = '/var/tmp/machine-provision-' + uuid;
    var expiresAt;
    var timeoutMinutes = 10;

    function checkIfReady() {
        fs.exists(filename, function (exists) {
            if (!exists) {
                return callback();
            }

            return async.waterfall([
                function (wf$callback) {
                    if (!expiresAt) {
                        fs.stat(filename, function (error, stats) {
                            expiresAt =
                                timeoutMinutes * 60 * 1000 + stats.ctime;
                            return wf$callback(error);
                        });
                    }
                    return wf$callback();
                }
            ],
            function (error) {
                // Check if we exceeded the timeout duration.
                var now = Number(new Date());
                if (now > expiresAt) {
                    fs.unlink(filename, function () {
                        return callback();
                    });
                } else {
                    setTimeout(checkIfReady, 10 * 1000);
                }
            });
        });
    }

    checkIfReady();
}


module.exports = {
    ensureProvisionComplete: ensureProvisionComplete,
    makeVmadmLogger: makeVmadmLogger,
    modifyConfig: modifyConfig,
    provisionInProgressFile: provisionInProgressFile,
    zoneList: zoneList,
    zoneadm: zoneadm
};
