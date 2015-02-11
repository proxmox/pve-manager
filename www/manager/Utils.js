Ext.ns('PVE');

// avoid errors when running without development tools
if (!Ext.isDefined(Ext.global.console)) {   
    var console = { 
	dir: function() {}, 
	log: function() {} 
    };
}
console.log("Starting PVE Manager"); 

Ext.Ajax.defaultHeaders = {
    'Accept': 'application/json'
};

Ext.Ajax.on('beforerequest', function(conn, options) {
    if (PVE.CSRFPreventionToken) {
	if (!options.headers) { 
	    options.headers = {};
	}
	options.headers.CSRFPreventionToken = PVE.CSRFPreventionToken;
    }
});

var IPV4_OCTET = "(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9])";
var IPV4_REGEXP = "(?:(?:" + IPV4_OCTET + "\\.){3}" + IPV4_OCTET + ")";
var IPV6_H16 = "(?:[0-9a-fA-F]{1,4})";
var IPV6_LS32 = "(?:(?:" + IPV6_H16 + ":" + IPV6_H16 + ")|" + IPV4_REGEXP + ")";


var IP4_match = new RegExp("^(?:" + IPV4_REGEXP + ")$");

var IPV6_REGEXP = "(?:" +
    "(?:(?:"                                                  + "(?:" + IPV6_H16 + ":){6})" + IPV6_LS32 + ")|" +
    "(?:(?:"                                         +   "::" + "(?:" + IPV6_H16 + ":){5})" + IPV6_LS32 + ")|" +
    "(?:(?:(?:"                           + IPV6_H16 + ")?::" + "(?:" + IPV6_H16 + ":){4})" + IPV6_LS32 + ")|" +
    "(?:(?:(?:(?:" + IPV6_H16 + ":){0,1}" + IPV6_H16 + ")?::" + "(?:" + IPV6_H16 + ":){3})" + IPV6_LS32 + ")|" +
    "(?:(?:(?:(?:" + IPV6_H16 + ":){0,2}" + IPV6_H16 + ")?::" + "(?:" + IPV6_H16 + ":){2})" + IPV6_LS32 + ")|" +
    "(?:(?:(?:(?:" + IPV6_H16 + ":){0,3}" + IPV6_H16 + ")?::" + "(?:" + IPV6_H16 + ":){1})" + IPV6_LS32 + ")|" +
    "(?:(?:(?:(?:" + IPV6_H16 + ":){0,4}" + IPV6_H16 + ")?::" +                         ")" + IPV6_LS32 + ")|" +
    "(?:(?:(?:(?:" + IPV6_H16 + ":){0,5}" + IPV6_H16 + ")?::" +                         ")" + IPV6_H16  + ")|" +
    "(?:(?:(?:(?:" + IPV6_H16 + ":){0,7}" + IPV6_H16 + ")?::" +                         ")"             + ")"  +
    ")";

var IP64_match = new RegExp("^(?:" + IPV6_REGEXP + "|" + IPV4_REGEXP + ")$");

Ext.define('PVE.Utils', { statics: {

    // this class only contains static functions

    toolkit: undefined, // (extjs|touch), set inside Toolkit.js 

    log_severity_hash: {
	0: "panic",
	1: "alert",
	2: "critical",
	3: "error",
	4: "warning",
	5: "notice",
	6: "info",
	7: "debug"
    },

    support_level_hash: {
	'c': gettext('Community'),
	'b': gettext('Basic'),
	's': gettext('Standard'),
	'p': gettext('Premium')
    },

    noSubKeyHtml: 'You do not have a valid subscription for this server. Please visit <a target="_blank" href="http://www.proxmox.com/products/proxmox-ve/subscription-service-plans">www.proxmox.com</a> to get a list of available options.',

    kvm_ostypes: {
	other: gettext('Other OS types'),
	wxp: 'Microsoft Windows XP/2003',
	w2k: 'Microsoft Windows 2000',
	w2k8: 'Microsoft Windows Vista/2008',
	win7: 'Microsoft Windows 7/2008r2',
	win8: 'Microsoft Windows 8/2012',
	l24: 'Linux 2.4 Kernel',
	l26: 'Linux 3.X/2.6 Kernel',
	solaris: 'Solaris Kernel'
    },

    render_kvm_ostype: function (value) {
	if (!value) {
	    return gettext('Other OS types');
	}
	var text = PVE.Utils.kvm_ostypes[value];
	if (text) {
	    return text + ' (' + value + ')';
	}
	return value;
    },

    render_hotplug_features: function (value) {
 	var fa = [];

	if (!value || (value === '0')) {
	    return gettext('disabled');
	}

	Ext.each(value.split(','), function(el) {
	    if (el === 'disk') {
		fa.push(gettext('Disk'));
	    } else if (el === 'network') {
		fa.push(gettext('Network'));
	    } else if (el === 'usb') {
		fa.push(gettext('USB'));
	    } else if (el === 'memory') {
		fa.push(gettext('Memory'));
	    } else if (el === 'cpu') {
		fa.push(gettext('CPU'));
	    } else {
		fa.push(el);
	    }
	});

	return fa.join(', ');
    },

    network_iface_types: {
	eth: gettext("Network Device"),
	bridge: 'Linux Bridge',
	bond: 'Linux Bond',
	OVSBridge: 'OVS Bridge',
	OVSBond: 'OVS Bond',
	OVSPort: 'OVS Port',
	OVSIntPort: 'OVS IntPort'
    },

    render_network_iface_type: function(value) {
	return PVE.Utils.network_iface_types[value] || 
	    PVE.Utils.unknownText;
    },

    render_scsihw: function(value) {
	if (!value) {
	    return PVE.Utils.defaultText + ' (LSI 53C895A)';
	} else if (value === 'lsi') {
	    return 'LSI 53C895A';
	} else if (value === 'lsi53c810') {
	    return 'LSI 53C810';
	} else if (value === 'megasas') {
	    return 'MegaRAID SAS 8708EM2';
	} else if (value === 'virtio-scsi-pci') {
	    return 'VIRTIO';
	} else if (value === 'pvscsi') {
	    return 'VMware PVSCSI';
	} else {
	    return value;
	}
    },

    // fixme: auto-generate this
    // for now, please keep in sync with PVE::Tools::kvmkeymaps
    kvm_keymaps: {
	//ar: 'Arabic',
	da: 'Danish',
	de: 'German', 
	'de-ch': 'German (Swiss)', 
	'en-gb': 'English (UK)', 
	'en-us': 'English (USA',
	es: 'Spanish',
	//et: 'Estonia',
	fi: 'Finnish',
	//fo: 'Faroe Islands', 
	fr: 'French', 
	'fr-be': 'French (Belgium)', 
	'fr-ca': 'French (Canada)',
	'fr-ch': 'French (Swiss)',
	//hr: 'Croatia',
	hu: 'Hungarian',
	is: 'Icelandic',
	it: 'Italian', 
	ja: 'Japanese',
	lt: 'Lithuanian',
	//lv: 'Latvian',
	mk: 'Macedonian', 
	nl: 'Dutch',
	//'nl-be': 'Dutch (Belgium)',
	no: 'Norwegian', 
	pl: 'Polish',
	pt: 'Portuguese',
	'pt-br': 'Portuguese (Brazil)',
	//ru: 'Russian',
	sl: 'Slovenian',
	sv: 'Swedish',
	//th: 'Thai',
	tr: 'Turkish'
    },

    kvm_vga_drivers: {
	std: gettext('Standard VGA'),
	vmware: gettext('VMWare compatible'),
	cirrus: 'Cirrus Logic GD5446',
	qxl: 'SPICE',
	qxl2: 'SPICE dual monitor',
	qxl3: 'SPICE three monitors',
	qxl4: 'SPICE four monitors',
	serial0: gettext('Serial terminal') + ' 0',
	serial1: gettext('Serial terminal') + ' 1',
	serial2: gettext('Serial terminal') + ' 2',
	serial3: gettext('Serial terminal') + ' 3'
    },

    render_kvm_language: function (value) {
	if (!value) {
	    return PVE.Utils.defaultText;
	}
	var text = PVE.Utils.kvm_keymaps[value];
	if (text) {
	    return text + ' (' + value + ')';
	}
	return value;
    },

    kvm_keymap_array: function() {
	var data = [['', PVE.Utils.render_kvm_language('')]];
	Ext.Object.each(PVE.Utils.kvm_keymaps, function(key, value) {
	    data.push([key, PVE.Utils.render_kvm_language(value)]);
	});

	return data;
    },

    render_console_viewer: function(value) {
	if (!value) {
	    return PVE.Utils.defaultText + ' (HTML5)';
	} else if (value === 'applet') {
	    return 'Java VNC Applet';
	} else if (value === 'vv') {
	    return  'SPICE (remote-viewer)';
	} else if (value === 'html5') {
	    return  'HTML5 (noVNC)';
	} else {
	    return value;
	}
    },

    language_map: {
	zh_CN: 'Chinese',
	ca: 'Catalan',
	da: 'Danish',
	en: 'English',
	eu: 'Euskera (Basque)',
	fr: 'French',
	de: 'German',
	it: 'Italian',
	ja: 'Japanese',
	nb: 'Norwegian (Bokmal)',
	nn: 'Norwegian (Nynorsk)',
	fa: 'Persian (Farsi)',
	pl: 'Polish',
	pt_BR: 'Portuguese (Brazil)',
	ru: 'Russian',
	sl: 'Slovenian',
	es: 'Spanish',
	sv: 'Swedish',
	tr: 'Turkish'
    },

    render_language: function (value) {
	if (!value) {
	    return PVE.Utils.defaultText + ' (English)';
	}
	var text = PVE.Utils.language_map[value];
	if (text) {
	    return text + ' (' + value + ')';
	}
	return value;
    },

    language_array: function() {
	var data = [['', PVE.Utils.render_language('')]];
	Ext.Object.each(PVE.Utils.language_map, function(key, value) {
	    data.push([key, PVE.Utils.render_language(value)]);
	});

	return data;
    },

    render_kvm_vga_driver: function (value) {
	if (!value) {
	    return PVE.Utils.defaultText;
	}
	var text = PVE.Utils.kvm_vga_drivers[value];
	if (text) { 
	    return text + ' (' + value + ')';
	}
	return value;
    },

    kvm_vga_driver_array: function() {
	var data = [['', PVE.Utils.render_kvm_vga_driver('')]];
	Ext.Object.each(PVE.Utils.kvm_vga_drivers, function(key, value) {
	    data.push([key, PVE.Utils.render_kvm_vga_driver(value)]);
	});

	return data;
    },

    render_kvm_startup: function(value) {
	var startup = PVE.Parser.parseStartup(value);

	var res = 'order=';
	if (startup.order === undefined) {
	    res += 'any';
	} else {
	    res += startup.order;
	}
	if (startup.up !== undefined) {
	    res += ',up=' + startup.up;
	}
	if (startup.down !== undefined) {
	    res += ',down=' + startup.down;
	}

	return res;
    },

    authOK: function() {
	return Ext.util.Cookies.get('PVEAuthCookie');
    },

    authClear: function() {
	Ext.util.Cookies.clear("PVEAuthCookie");
    },

    // fixme: remove - not needed?
    gridLineHeigh: function() {
	return 21;
	
	//if (Ext.isGecko)
	//return 23;
	//return 21;
    },

    extractRequestError: function(result, verbose) {
	var msg = gettext('Successful');

	if (!result.success) {
	    msg = gettext("Unknown error");
	    if (result.message) {
		msg = result.message;
		if (result.status) {
		    msg += ' (' + result.status + ')';
		}
	    }
	    if (verbose && Ext.isObject(result.errors)) {
		msg += "<br>";
		Ext.Object.each(result.errors, function(prop, desc) {
		    msg += "<br><b>" + Ext.htmlEncode(prop) + "</b>: " + 
			Ext.htmlEncode(desc);
		});
	    }	
	}

	return msg;
    },

    extractFormActionError: function(action) {
	var msg;
	switch (action.failureType) {
	case Ext.form.action.Action.CLIENT_INVALID:
	    msg = gettext('Form fields may not be submitted with invalid values');
	    break;
	case Ext.form.action.Action.CONNECT_FAILURE:
	    msg = gettext('Connection error');
	    var resp = action.response;
	    if (resp.status && resp.statusText) {
		msg += " " + resp.status + ": " + resp.statusText;
	    }
	    break;
	case Ext.form.action.Action.LOAD_FAILURE:
	case Ext.form.action.Action.SERVER_INVALID:
	    msg = PVE.Utils.extractRequestError(action.result, true);
	    break;
	}
	return msg;
    },

    // Ext.Ajax.request
    API2Request: function(reqOpts) {

	var newopts = Ext.apply({
	    waitMsg: gettext('Please wait...')
	}, reqOpts);

	if (!newopts.url.match(/^\/api2/)) {
	    newopts.url = '/api2/extjs' + newopts.url;
	}
	delete newopts.callback;

	var createWrapper = function(successFn, callbackFn, failureFn) {
	    Ext.apply(newopts, {
		success: function(response, options) {
		    if (options.waitMsgTarget) {
			if (PVE.Utils.toolkit === 'touch') {
			    options.waitMsgTarget.setMasked(false);
			} else {
			    options.waitMsgTarget.setLoading(false);
			}
		    }
		    var result = Ext.decode(response.responseText);
		    response.result = result;
		    if (!result.success) {
			response.htmlStatus = PVE.Utils.extractRequestError(result, true);
			Ext.callback(callbackFn, options.scope, [options, false, response]);
			Ext.callback(failureFn, options.scope, [response, options]);
			return;
		    }
		    Ext.callback(callbackFn, options.scope, [options, true, response]);
		    Ext.callback(successFn, options.scope, [response, options]);
		},
		failure: function(response, options) {
		    if (options.waitMsgTarget) {
			if (PVE.Utils.toolkit === 'touch') {
			    options.waitMsgTarget.setMasked(false);
			} else {
			    options.waitMsgTarget.setLoading(false);
			}
		    }
		    response.result = {};
		    try {
			response.result = Ext.decode(response.responseText);
		    } catch(e) {}
		    var msg = gettext('Connection error') + ' - server offline?';
		    if (response.aborted) {
			msg = gettext('Connection error') + ' - aborted.';
		    } else if (response.timedout) {
			msg = gettext('Connection error') + ' - Timeout.';
		    } else if (response.status && response.statusText) {
			msg = gettext('Connection error') + ' ' + response.status + ': ' + response.statusText;
		    }
		    response.htmlStatus = msg;
		    Ext.callback(callbackFn, options.scope, [options, false, response]);
		    Ext.callback(failureFn, options.scope, [response, options]);
		}
	    });
	};

	createWrapper(reqOpts.success, reqOpts.callback, reqOpts.failure);

	var target = newopts.waitMsgTarget;
	if (target) {
	    if (PVE.Utils.toolkit === 'touch') {
		target.setMasked({ xtype: 'loadmask', message: newopts.waitMsg} );
	    } else {
		// Note: ExtJS bug - this does not work when component is not rendered
		target.setLoading(newopts.waitMsg);
	    }
	}
	Ext.Ajax.request(newopts);
    },

    assemble_field_data: function(values, data) {
        if (Ext.isObject(data)) {
	    Ext.Object.each(data, function(name, val) {
		if (values.hasOwnProperty(name)) {
                    var bucket = values[name];
                    if (!Ext.isArray(bucket)) {
                        bucket = values[name] = [bucket];
                    }
                    if (Ext.isArray(val)) {
                        values[name] = bucket.concat(val);
                    } else {
                        bucket.push(val);
                    }
                } else {
		    values[name] = val;
                }
            });
	}
    },

    checked_command: function(orig_cmd) {
	PVE.Utils.API2Request({
	    url: '/nodes/localhost/subscription',
	    method: 'GET',
	    //waitMsgTarget: me,
	    failure: function(response, opts) {
		Ext.Msg.alert(gettext('Error'), response.htmlStatus);
	    },
	    success: function(response, opts) {
		var data = response.result.data;

		if (data.status !== 'Active') {
		    Ext.Msg.show({
			title: gettext('No valid subscription'),
			icon: Ext.Msg.WARNING,
			msg: PVE.Utils.noSubKeyHtml,
			buttons: Ext.Msg.OK,
			callback: function(btn) {
			    if (btn !== 'ok') {
				return;
			    }
			    orig_cmd();
			}
		    });
		} else {
		    orig_cmd();
		}
	    }
	});
    },

    task_desc_table: {
	vncproxy: [ 'VM/CT', gettext('Console') ],
	spiceproxy: [ 'VM/CT', gettext('Console') + ' (Spice)' ],
	vncshell: [ '', gettext('Shell') ],
	spiceshell: [ '', gettext('Shell')  + ' (Spice)' ],
	qmsnapshot: [ 'VM', gettext('Snapshot') ],
	qmrollback: [ 'VM', gettext('Rollback') ],
	qmdelsnapshot: [ 'VM', gettext('Delete Snapshot') ],
	qmcreate: [ 'VM', gettext('Create') ],
	qmrestore: [ 'VM', gettext('Restore') ],
	qmdestroy: [ 'VM', gettext('Destroy') ],
	qmigrate: [ 'VM', gettext('Migrate') ],
	qmclone: [ 'VM', gettext('Clone') ],
	qmmove: [ 'VM', gettext('Move disk') ],
	qmtemplate: [ 'VM', gettext('Convert to template') ],
	qmstart: [ 'VM', gettext('Start') ],
	qmstop: [ 'VM', gettext('Stop') ],
	qmreset: [ 'VM', gettext('Reset') ],
	qmshutdown: [ 'VM', gettext('Shutdown') ],
	qmsuspend: [ 'VM', gettext('Suspend') ],
	qmresume: [ 'VM', gettext('Resume') ],
	qmconfig: [ 'VM', gettext('Configure') ],
	vzcreate: ['CT', gettext('Create') ],
	vzrestore: ['CT', gettext('Restore') ],
	vzdestroy: ['CT', gettext('Destroy') ],
	vzmigrate: [ 'CT', gettext('Migrate') ],
	vzstart: ['CT', gettext('Start') ],
	vzstop: ['CT', gettext('Stop') ],
	vzmount: ['CT', gettext('Mount') ],
	vzumount: ['CT', gettext('Unmount') ],
	vzshutdown: ['CT', gettext('Shutdown') ],
	vzsuspend: [ 'CT', gettext('Suspend') ],
	vzresume: [ 'CT', gettext('Resume') ],
	hamigrate: [ 'HA', gettext('Migrate') ],
	hastart: [ 'HA', gettext('Start') ],
	hastop: [ 'HA', gettext('Stop') ],
	srvstart: ['SRV', gettext('Start') ],
	srvstop: ['SRV', gettext('Stop') ],
	srvrestart: ['SRV', gettext('Restart') ],
	srvreload: ['SRV', gettext('Reload') ],
	cephcreatemon: ['Ceph Monitor', gettext('Create') ],
	cephdestroymon: ['Ceph Monitor', gettext('Destroy') ],
	cephcreateosd: ['Ceph OSD', gettext('Create') ],
	cephdestroyosd: ['Ceph OSD', gettext('Destroy') ],
	imgcopy: ['', gettext('Copy data') ],
	imgdel: ['', gettext('Erase data') ],
	download: ['', gettext('Download') ],
	vzdump: ['', gettext('Backup') ],
	aptupdate: ['', gettext('Update package database') ],
	startall: [ '', gettext('Start all VMs and Containers') ],
	stopall: [ '', gettext('Stop all VMs and Containers') ],
	migrateall: [ '', gettext('Migrate all VMs and Containers') ]
    },

    format_task_description: function(type, id) {	
	var farray = PVE.Utils.task_desc_table[type];
	if (!farray) {
	    return type;
	}
	var prefix = farray[0];
	var text = farray[1];
	if (prefix) {
	    return prefix + ' ' + id + ' - ' + text; 
	}
	return text;
    },

    parse_task_upid: function(upid) {
	var task = {};

	var res = upid.match(/^UPID:(\S+):([0-9A-Fa-f]{8}):([0-9A-Fa-f]{8,9}):([0-9A-Fa-f]{8}):([^:\s]+):([^:\s]*):([^:\s]+):$/);
	if (!res) {
	    throw "unable to parse upid '" + upid + "'";
	}
	task.node = res[1];
	task.pid = parseInt(res[2], 16);
	task.pstart = parseInt(res[3], 16);
	task.starttime = parseInt(res[4], 16);
	task.type = res[5];
	task.id = res[6];
	task.user = res[7];

	task.desc = PVE.Utils.format_task_description(task.type, task.id);

	return task;
    },

    format_size: function(size) {
	/*jslint confusion: true */

	if (size < 1024) {
	    return size;
	}

	var kb = size / 1024;

	if (kb < 1024) {
	    return kb.toFixed(0) + "KB";
	}

	var mb = size / (1024*1024);

	if (mb < 1024) {
	    return mb.toFixed(0) + "MB";
	}

	var gb = mb / 1024;

	if (gb < 1024) {
	    return gb.toFixed(2) + "GB";
	}

	var tb =  gb / 1024;

	return tb.toFixed(2) + "TB";

    },

    format_html_bar: function(per, text) {

	return "<div class='pve-bar-wrap'>" + text + "<div class='pve-bar-border'>" +
	    "<div class='pve-bar-inner' style='width:" + per + "%;'></div>" +
	    "</div></div>";
	
    },

    format_cpu_bar: function(per1, per2, text) {

	return "<div class='pve-bar-border'>" +
	    "<div class='pve-bar-inner' style='width:" + per1 + "%;'></div>" +
	    "<div class='pve-bar-inner2' style='width:" + per2 + "%;'></div>" +
	    "<div class='pve-bar-text'>" + text + "</div>" + 
	    "</div>";
    },

    format_large_bar: function(per, text) {

	if (!text) {
	    text = per.toFixed(1) + "%";
	}

	return "<div class='pve-largebar-border'>" +
	    "<div class='pve-largebar-inner' style='width:" + per + "%;'></div>" +
	    "<div class='pve-largebar-text'>" + text + "</div>" + 
	    "</div>";
    },

    format_duration_long: function(ut) {

	var days = Math.floor(ut / 86400);
	ut -= days*86400;
	var hours = Math.floor(ut / 3600);
	ut -= hours*3600;
	var mins = Math.floor(ut / 60);
	ut -= mins*60;

	var hours_str = '00' + hours.toString();
	hours_str = hours_str.substr(hours_str.length - 2);
	var mins_str = "00" + mins.toString();
	mins_str = mins_str.substr(mins_str.length - 2);
	var ut_str = "00" + ut.toString();
	ut_str = ut_str.substr(ut_str.length - 2);

	if (days) {
	    var ds = days > 1 ? PVE.Utils.daysText : PVE.Utils.dayText;
	    return days.toString() + ' ' + ds + ' ' + 
		hours_str + ':' + mins_str + ':' + ut_str;
	} else {
	    return hours_str + ':' + mins_str + ':' + ut_str;
	}
    },

    format_duration_short: function(ut) {
	
	if (ut < 60) {
	    return ut.toString() + 's';
	}

	if (ut < 3600) {
	    var mins = ut / 60;
	    return mins.toFixed(0) + 'm';
	}

	if (ut < 86400) {
	    var hours = ut / 3600;
	    return hours.toFixed(0) + 'h';
	}

	var days = ut / 86400;
	return days.toFixed(0) + 'd';	
    },

    yesText: gettext('Yes'),
    noText: gettext('No'),
    noneText: gettext('none'),
    errorText: gettext('Error'),
    unknownText: gettext('Unknown'),
    defaultText: gettext('Default'),
    daysText: gettext('days'),
    dayText: gettext('day'),
    runningText: gettext('running'),
    stoppedText: gettext('stopped'),
    neverText: gettext('never'),
    totalText: gettext('Total'),
    usedText: gettext('Used'),
    directoryText: gettext('Directory'),
    imagesText: gettext('Disk image'),
    backupFileText: gettext('VZDump backup file'),
    vztmplText: gettext('OpenVZ template'),
    isoImageText: gettext('ISO image'),
    containersText: gettext('OpenVZ Container'),

    format_expire: function(date) {
	if (!date) {
	    return PVE.Utils.neverText;
	}
	return Ext.Date.format(date, "Y-m-d");
    },

    format_storage_type: function(value) {
	if (value === 'dir') {
	    return PVE.Utils.directoryText;
	} else if (value === 'nfs') {
	    return 'NFS';
	} else if (value === 'glusterfs') {
	    return 'GlusterFS';
	} else if (value === 'lvm') {
	    return 'LVM';
	} else if (value === 'iscsi') {
	    return 'iSCSI';
	} else if (value === 'rbd') {
	    return 'RBD';
	} else if (value === 'sheepdog') {
	    return 'Sheepdog';
	} else if (value === 'zfs') {
	    return 'ZFS over iSCSI';
	} else if (value === 'zfspool') {
	    return 'ZFS';
	} else if (value === 'iscsidirect') {
	    return 'iSCSIDirect';
	} else {
	    return PVE.Utils.unknownText;
	}
    },

    format_boolean_with_default: function(value) {
	if (Ext.isDefined(value) && value !== '') {
	    return value ? PVE.Utils.yesText : PVE.Utils.noText;
	}
	return PVE.Utils.defaultText;
    },

    format_boolean: function(value) {
	return value ? PVE.Utils.yesText : PVE.Utils.noText;
    },

    format_neg_boolean: function(value) {
	return !value ? PVE.Utils.yesText : PVE.Utils.noText;
    },

    format_content_types: function(value) {
	var cta = [];

	Ext.each(value.split(',').sort(), function(ct) {
	    if (ct === 'images') {
		cta.push(PVE.Utils.imagesText);
	    } else if (ct === 'backup') {
		cta.push(PVE.Utils.backupFileText);
	    } else if (ct === 'vztmpl') {
		cta.push(PVE.Utils.vztmplText);
	    } else if (ct === 'iso') {
		cta.push(PVE.Utils.isoImageText);
	    } else if (ct === 'rootdir') {
		cta.push(PVE.Utils.containersText);
	    }
	});

	return cta.join(', ');
    },

    render_storage_content: function(value, metaData, record) {
	var data = record.data;
	if (Ext.isNumber(data.channel) &&
	    Ext.isNumber(data.id) &&
	    Ext.isNumber(data.lun)) {
	    return "CH " + 
		Ext.String.leftPad(data.channel,2, '0') + 
		" ID " + data.id + " LUN " + data.lun;
	}
	return data.volid.replace(/^.*:(.*\/)?/,'');
    },

    render_serverity: function (value) {
	return PVE.Utils.log_severity_hash[value] || value;
    },

    render_cpu: function(value, metaData, record, rowIndex, colIndex, store) {

	if (!(record.data.uptime && Ext.isNumeric(value))) {
	    return '';
	}

	var maxcpu = record.data.maxcpu || 1;

	if (!Ext.isNumeric(maxcpu) && (maxcpu >= 1)) {
	    return '';
	}
	
	var per = value * 100;

	return per.toFixed(1) + '% of ' + maxcpu.toString() + (maxcpu > 1 ? 'CPUs' : 'CPU');
    },

    render_size: function(value, metaData, record, rowIndex, colIndex, store) {
	/*jslint confusion: true */

	if (!Ext.isNumeric(value)) {
	    return '';
	}

	return PVE.Utils.format_size(value);
    },

    render_timestamp: function(value, metaData, record, rowIndex, colIndex, store) {
	var servertime = new Date(value * 1000);
	return Ext.Date.format(servertime, 'Y-m-d H:i:s');
    },

    render_mem_usage: function(value, metaData, record, rowIndex, colIndex, store) {

	var mem = value;
	var maxmem = record.data.maxmem;
	
	if (!record.data.uptime) {
	    return '';
	}

	if (!(Ext.isNumeric(mem) && maxmem)) {
	    return '';
	}

	var per = (mem * 100) / maxmem;

	return per.toFixed(1) + '%';
    },

    render_disk_usage: function(value, metaData, record, rowIndex, colIndex, store) {

	var disk = value;
	var maxdisk = record.data.maxdisk;

	if (!(Ext.isNumeric(disk) && maxdisk)) {
	    return '';
	}

	var per = (disk * 100) / maxdisk;

	return per.toFixed(1) + '%';
    },

    render_resource_type: function(value, metaData, record, rowIndex, colIndex, store) {

	var cls = 'pve-itype-icon-' + value;

	if (record.data.running) {
	    metaData.tdCls = cls + "-running";
	} else if (record.data.template) {
	    metaData.tdCls = cls + "-template";	    
	} else {
	    metaData.tdCls = cls;
	}

	return value;
    },

    render_uptime: function(value, metaData, record, rowIndex, colIndex, store) {

	var uptime = value;

	if (uptime === undefined) {
	    return '';
	}
	
	if (uptime <= 0) {
	    return '-';
	}

	return PVE.Utils.format_duration_long(uptime);
    },

    render_support_level: function(value, metaData, record) {
	return PVE.Utils.support_level_hash[value] || '-';
    },

    render_upid: function(value, metaData, record) { 
	var type = record.data.type;
	var id = record.data.id;

	return PVE.Utils.format_task_description(type, id);
    },

    dialog_title: function(subject, create, isAdd) {
	if (create) {
	    if (isAdd) {
		return gettext('Add') + ': ' + subject;
	    } else {
		return gettext('Create') + ': ' + subject;
	    }
	} else {
	    return gettext('Edit') + ': ' + subject;
	}
    },
 
    openDefaultConsoleWindow: function(allowSpice, vmtype, vmid, nodename, vmname) {
	var dv = PVE.Utils.defaultViewer(allowSpice);
	PVE.Utils.openConsoleWindow(dv, vmtype, vmid, nodename, vmname);
    },

    openConsoleWindow: function(viewer, vmtype, vmid, nodename, vmname) {
	// kvm, openvz, shell, upgrade

	if (vmid == undefined && (vmtype === 'kvm' || vmtype === 'openvz')) {
	    throw "missing vmid";
	}

	if (!nodename) {
	    throw "no nodename specified";
	}

	if (viewer === 'applet' || viewer === 'html5') {
	    PVE.Utils.openVNCViewer(vmtype, vmid, nodename, vmname, viewer === 'html5');
	} else if (viewer === 'vv') {
	    var url;
	    var params = { proxy: window.location.hostname };
	    if (vmtype === 'kvm') {
		url = '/nodes/' + nodename + '/qemu/' + vmid.toString() + '/spiceproxy';
		PVE.Utils.openSpiceViewer(url, params);
	    } else if (vmtype === 'openvz') {
		url = '/nodes/' + nodename + '/openvz/' + vmid.toString() + '/spiceproxy';
		PVE.Utils.openSpiceViewer(url, params);
	    } else if (vmtype === 'shell') {
		url = '/nodes/' + nodename + '/spiceshell';
		PVE.Utils.openSpiceViewer(url, params);
	    } else if (vmtype === 'upgrade') {
		url = '/nodes/' + nodename + '/spiceshell';
		params.upgrade = 1;
		PVE.Utils.openSpiceViewer(url, params);
	    }
	} else {
	    throw "unknown viewer type";
	}
    },

    defaultViewer: function(allowSpice) {
	var vncdefault = 'html5';
	var dv = PVE.VersionInfo.console || vncdefault;
	if (dv === 'vv' && !allowSpice) {
	    dv = vncdefault;
	}

	return dv;
    },

    openVNCViewer: function(vmtype, vmid, nodename, vmname, novnc) {
	var url = Ext.urlEncode({
	    console: vmtype, // kvm, openvz, upgrade or shell
	    novnc: novnc ? 1 : 0,
	    vmid: vmid,
	    vmname: vmname,
	    node: nodename
	});
	var nw = window.open("?" + url, '_blank', "innerWidth=745,innerheight=427");
	nw.focus();
    },

    openSpiceViewer: function(url, params){

	var downloadWithName = function(uri, name) {
	    var link = Ext.DomHelper.append(document.body, {
		tag: 'a',
		href: uri,
		css : 'display:none;visibility:hidden;height:0px;'
	    });

	    // Note: we need to tell android the correct file name extension
	    // but we do not set 'download' tag for other environments, because
	    // It can have strange side effects (additional user prompt on firefox)
	    var andriod = navigator.userAgent.match(/Android/i) ? true : false;
	    if (andriod) {
		link.download = name;
	    }

	    if (link.fireEvent) {
		link.fireEvent('onclick');
	    } else {
                var evt = document.createEvent("MouseEvents");
                evt.initMouseEvent('click', true, true, window, 1, 0, 0, 0, 0, false, false, false, false, 0, null);
		link.dispatchEvent(evt);
	    }
	};

	PVE.Utils.API2Request({
	    url: url,
	    params: params,
	    method: 'POST',
	    failure: function(response, opts){
		Ext.Msg.alert('Error', response.htmlStatus);
	    },
	    success: function(response, opts){
		var raw = "[virt-viewer]\n";
		Ext.Object.each(response.result.data, function(k, v) {
		    raw += k + "=" + v + "\n";
		});
		var url = 'data:application/x-virt-viewer;charset=UTF-8,' +
		    encodeURIComponent(raw);
		    
		downloadWithName(url, "pve-spice.vv");
	    }
	});
    },

    // comp.setLoading() is buggy in ExtJS 4.0.7, so we 
    // use el.mask() instead
    setErrorMask: function(comp, msg) {
	var el = comp.el;
	if (!el) {
	    return;
	}
	if (!msg) {
	    el.unmask();
	} else {
	    if (msg === true) {
		el.mask(gettext("Loading..."));
	    } else {
		el.mask(msg);
	    }
	}
    },

    monStoreErrors: function(me, store) {
	me.mon(store, 'beforeload', function(s, operation, eOpts) {
	    if (!me.loadCount) {
		me.loadCount = 0; // make sure it is numeric
		PVE.Utils.setErrorMask(me, true);
	    }
	});

	// only works with 'pve' proxy
	me.mon(store.proxy, 'afterload', function(proxy, request, success) {
	    me.loadCount++;

	    if (success) {
		PVE.Utils.setErrorMask(me, false);
		return;
	    }

	    var msg;
	    var operation = request.operation;
	    var error = operation.getError();
	    if (error.statusText) {
		msg = error.statusText + ' (' + error.status + ')';
	    } else {
		msg = gettext('Connection error');
	    }
	    PVE.Utils.setErrorMask(me, msg);
	});
    }

}});

