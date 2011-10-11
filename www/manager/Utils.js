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

// do not send '_dc' parameter
Ext.Ajax.disableCaching = false;

Ext.Ajax.on('beforerequest', function(conn, options) {
    if (PVE.CSRFPreventionToken) {
	if (!options.headers) { 
	    options.headers = {};
	}
	options.headers.CSRFPreventionToken = PVE.CSRFPreventionToken;
    }
});

// custom Vtypes
Ext.apply(Ext.form.field.VTypes, {
    IPAddress:  function(v) {
        return (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/).test(v);
    },
    IPAddressText: 'Must be a numeric IP address',
    IPAddressMask: /[\d\.]/i,

    MacAddress: function(v) {
	return (/^([a-fA-F0-9]{2}:){5}[a-fA-F0-9]{2}$/).test(v);
    },
    MacAddressMask: /[a-fA-F0-9:]/,
    MacAddressText: 'Must be a valid MAC address (example: "01:23:45:67:89:ab")',

    BridgeName: function(v) {
        return (/^vmbr\d{1,4}$/).test(v);
    },
    BridgeNameText: 'Allowable bridge names: vmbr<b>N</b>, where 0 <= <b>N</b> <= 9999',

    BondName: function(v) {
        return (/^bond\d{1,4}$/).test(v);
    },
    BondNameText: 'Allowable bond names: bond<b>N</b>, where 0 <= <b>N</b> <= 9999',

    QemuStartDate: function(v) {
	return (/^(now|\d{4}-\d{1,2}-\d{1,2}(T\d{1,2}:\d{1,2}:\d{1,2})?)$/).test(v);
    },
    QemuStartDateText: 'Valid format for date are: "now" or "2006-06-17T16:01:21" or "2006-06-17"',

    StorageId:  function(v) {
        return (/^[a-z][a-z0-9\-\_\.]*[a-z0-9]$/i).test(v);
    },
    StorageIdText: "ID contains illegal characters (allowed characters: 'a-z', '0-9', '-', '_' and '.')",

    HttpProxy:  function(v) {
        return (/^http:\/\/.*$/).test(v);
    },
    HttpProxyText: "Must confirm to schema 'http://.*' (example: 'http://username:password@host:port/')"
});

// we dont want that a displayfield set the form dirty flag! 
Ext.override(Ext.form.field.Display, {
    isDirty: function() { return false; }
});

// hack: ExtJS does not display the correct value if we
// call setValue while the store is loading, so we need
// to call it again after loading
Ext.override(Ext.form.field.ComboBox, {
    onLoad: function() {
	this.setValue(this.value, false);
        this.callOverridden(arguments);
    }
});

Ext.define('PVE.Utils', { statics: {

    // this class only contains static functions

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

    kvm_ostypes: {
	other: 'Other',
	wxp: 'Microsoft Windows XP/2003',
	w2k: 'Microsoft Windows 2000',
	w2k8: 'Microsoft Windows Vista/2008',
	win7: 'Microsoft Windows 7/2008r2',
	l24: 'Linux 2.4 Kernel',
	l26: 'Linux 3.X/2.6 Kernel'
    },

    render_kvm_ostype: function (value) {
	if (!value) {
	    return 'Other';
	}
	var text = PVE.Utils.kvm_ostypes[value];
	if (text) {
	    return text + ' (' + value + ')';
	}
	return value;
    },

    // fixme: auto-generate this
    // for now, please keep in sync with PVE::Tools::kvmkeymaps
    kvm_keymaps: {
	//ar: 'Arabic',
	dk: 'Danish',
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
	si: 'Slovenian'
	//sv: 'Swedish',
	//th: 'Thai',
	//tr: 'Turkish'
    },

    kvm_vga_drivers: {
	std: 'Standard VGA',
	vmware: 'VMWare compatible',
	cirrus: 'Cirrus Logic GD5446'
    },

    render_kvm_language: function (value) {
	if (!value) {
	    return 'Default';
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

    language_map: {
	en: 'English',
	de: 'German'
    },

    render_language: function (value) {
	if (!value) {
	    return 'Default (English)';
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
	    return 'OS default';
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
	var msg = 'Successful';

	if (!result.success) {
	    msg = "Unknown error";
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
	    msg = 'Form fields may not be submitted with invalid values';
	    break;
	case Ext.form.action.Action.CONNECT_FAILURE:
	    msg = 'Connect failure';
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
	    waitMsg: 'Please wait...'
	}, reqOpts);

	if (!newopts.url.match(/^\/api2/)) {
	    newopts.url = '/api2/extjs' + newopts.url;
	}
	delete newopts.callback;

	var createWrapper = function(successFn, callbackFn, failureFn) {
	    Ext.apply(newopts, {
		success: function(response, options) {
		    if (options.waitMsgTarget) {
			options.waitMsgTarget.setLoading(false);
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
			options.waitMsgTarget.setLoading(false);
		    }
		    var result = Ext.decode(response.responseText);
		    response.result = result || {};
		    var msg = "Connection error - server offline?";
		    if (response.aborted) {
			msg = 'Transaction aborted.';
		    } else if (response.timedout) {
			msg = 'Communication failure: Timeout.';
		    } else if (response.status && response.statusText) {
			msg = 'Connection error ' + response.status + ': ' + response.statusText;
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
	    // Note: ExtJS bug - this does not work when component is not rendered
	    target.setLoading(newopts.waitMsg, true);
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

    task_desc_table: {
	vncproxy: 'VNC connection to VM/CT {0}',
	vncshell: 'VNC shell',
	qmigrate: 'Migrate VM {0}',
	qmstart: 'Start VM {0}',
	qmstop: 'Stop VM {0}',
	qmreset: 'Reset VM {0}',
	qmshutdown: 'Shutdown VM {0}',
	qmsuspend: 'Suspend VM {0}',
	qmresume: 'Resume VM {0}',
	vzcreate: 'Create CT {0}',
	vzdestroy: 'Destroy CT {0}',
	vzstart: 'Start CT {0}',
	vzstop: 'Stop CT {0}',
	srvstart: 'Start service {0}',
	srvstop: 'Stop service {0}',
	srvrestart: 'Restart service {0}',
	srvreload: 'Reload service {0}'
    },

    format_task_description: function(type, id) {	
	var format = PVE.Utils.task_desc_table[type];
	if (format) {
	    return Ext.String.format(format, id);
	}
	return type;
    },

    parse_task_upid: function(upid) {
	var task = {};

	var res = upid.match(/^UPID:(\S+):([0-9A-Fa-f]{8}):([0-9A-Fa-f]{8}):([0-9A-Fa-f]{8}):([^:\s]+):([^:\s]*):([^:\s]+):$/);
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
	    var ds = days > 1 ? 'days' : 'day';
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

    format_storage_type: function(value) {
	if (value === 'dir') {
	    return 'Directory';
	} else if (value === 'nfs') {
	    return 'NFS';
	} else if (value === 'lvm') {
	    return 'LVM';
	} else if (value === 'iscsi') {
	    return 'iSCSI';
	} else {
	    return 'unknown';
	}
    },

    format_boolean_with_default: function(value) {
	if (Ext.isDefined(value) && value !== '') {
	    return value ? 'Yes' : 'No';
	}
	return 'Default';
    },

    format_boolean: function(value) {
	return value ? 'Yes' : 'No';
    },

    format_neg_boolean: function(value) {
	return !value ? 'Yes' : 'No';
    },

    format_content_types: function(value) {
	var cta = [];

	Ext.each(value.split(','), function(ct) {
	    if (ct === 'images') {
		cta.push('Images');
	    } else if (ct === 'backup') {
		cta.push('Backups');
	    } else if (ct === 'vztmpl') {
		cta.push('Templates');
	    } else if (ct === 'iso') {
		cta.push('ISO');
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

	var maxcpu = record.data.maxcpu;

	if (!record.data.uptime) {
	    return '';
	}

	if (!(Ext.isNumeric(value) && Ext.isNumeric(maxcpu) && (maxcpu >= 1))) {
	    return '';
	}

	var per = (value * 100) / maxcpu;

	return per.toFixed(1) + '% of ' + maxcpu.toString() + (maxcpu > 1 ? 'CPUs' : 'CPU');
    },

    render_size: function(value, metaData, record, rowIndex, colIndex, store) {

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

    render_upid: function(value, metaData, record) { 
	var type = record.data.type;
	var id = record.data.id;

	return PVE.Utils.format_task_description(type, id);
    }
}});

