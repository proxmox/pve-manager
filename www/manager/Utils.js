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
    IPAddressText:  gettext('Example') + ': 192.168.1.1',
    IPAddressMask: /[\d\.]/i,

    MacAddress: function(v) {
	return (/^([a-fA-F0-9]{2}:){5}[a-fA-F0-9]{2}$/).test(v);
    },
    MacAddressMask: /[a-fA-F0-9:]/,
    MacAddressText: gettext('Example') + ': 01:23:45:67:89:ab',

    BridgeName: function(v) {
        return (/^vmbr\d{1,4}$/).test(v);
    },
    BridgeNameText: gettext('Format') + ': vmbr<b>N</b>, where 0 <= <b>N</b> <= 9999',

    BondName: function(v) {
        return (/^bond\d{1,4}$/).test(v);
    },
    BondNameText: gettext('Format') + ': bond<b>N</b>, where 0 <= <b>N</b> <= 9999',

    QemuStartDate: function(v) {
	return (/^(now|\d{4}-\d{1,2}-\d{1,2}(T\d{1,2}:\d{1,2}:\d{1,2})?)$/).test(v);
    },
    QemuStartDateText: gettext('Format') + ': "now" or "2006-06-17T16:01:21" or "2006-06-17"',

    StorageId:  function(v) {
        return (/^[a-z][a-z0-9\-\_\.]*[a-z0-9]$/i).test(v);
    },
    StorageIdText: gettext("Allowed characters") + ": 'a-z', '0-9', '-', '_', '.'",

    HttpProxy:  function(v) {
        return (/^http:\/\/.*$/).test(v);
    },
    HttpProxyText: gettext('Example') + ": http://username:password&#64;host:port/",

    DnsName: function(v) {
	return (/^(([a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)\.)*([A-Za-z0-9]([A-Za-z0-9\-]*[A-Za-z0-9])?)$/).test(v);
    },
    DnsNameText: gettext('This is not a valid DNS name')
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

    support_level_hash: {
	'c': gettext('Community'),
	'b': gettext('Basic'),
	's': gettext('Standard'),
	'p': gettext('Premium')
    },

    kvm_ostypes: {
	other: gettext('Other OS types'),
	wxp: 'Microsoft Windows XP/2003',
	w2k: 'Microsoft Windows 2000',
	w2k8: 'Microsoft Windows Vista/2008',
	win7: 'Microsoft Windows 7/2008r2',
	l24: 'Linux 2.4 Kernel',
	l26: 'Linux 3.X/2.6 Kernel'
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
	si: 'Slovenian',
	sv: 'Swedish',
	//th: 'Thai',
	tr: 'Turkish'
    },

    kvm_vga_drivers: {
	std: 'Standard VGA',
	vmware: 'VMWare compatible',
	cirrus: 'Cirrus Logic GD5446'
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

    language_map: {
	zh_CN: 'Chinese',
	ja: 'Japanese',
	en: 'English',
	de: 'German',
	es: 'Spanish',
	fr: 'French',
	ru: 'Russian',
	sv: 'Swedish'
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
	    // Note: ExtJS bug - this does not work when component is not rendered
	    target.setLoading(newopts.waitMsg);
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
	vncproxy: [ 'VM/CT', gettext('Console') ],
	vncshell: [ '', gettext('Shell') ],
	qmcreate: [ 'VM', gettext('Create') ],
	qmrestore: [ 'VM', gettext('Restore') ],
	qmdestroy: [ 'VM', gettext('Destroy') ],
	qmigrate: [ 'VM', gettext('Migrate') ],
	qmstart: [ 'VM', gettext('Start') ],
	qmstop: [ 'VM', gettext('Stop') ],
	qmreset: [ 'VM', gettext('Reset') ],
	qmshutdown: [ 'VM', gettext('Shutdown') ],
	qmsuspend: [ 'VM', gettext('Suspend') ],
	qmresume: [ 'VM', gettext('Resume') ],
	vzcreate: ['CT', gettext('Create') ],
	vzrestore: ['CT', gettext('Restore') ],
	vzdestroy: ['CT', gettext('Destroy') ],
	vzmigrate: [ 'CT', gettext('Migrate') ],
	vzstart: ['CT', gettext('Start') ],
	vzstop: ['CT', gettext('Stop') ],
	vzmount: ['CT', gettext('Mount') ],
	vzumount: ['CT', gettext('Unmount') ],
	vzshutdown: ['CT', gettext('Shutdown') ],
	hamigrate: [ 'HA', gettext('Migrate') ],
	hastart: [ 'HA', gettext('Start') ],
	hastop: [ 'HA', gettext('Stop') ],
	srvstart: ['SRV', gettext('Start') ],
	srvstop: ['SRV', gettext('Stop') ],
	srvrestart: ['SRV', gettext('Restart') ],
	srvreload: ['SRV', gettext('Reload') ],
	imgcopy: ['', gettext('Copy data') ],
	imgdel: ['', gettext('Erase data') ],
	download: ['', gettext('Download') ],
	vzdump: ['', gettext('Backup') ]
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
    errorText: gettext('Error'),
    unknownText: gettext('Unknown'),
    defaultText: gettext('Default'),
    daysText: gettext('days'),
    dayText: gettext('day'),
    runningText: gettext('running'),
    stoppedText: gettext('stopped'),
    neverText: gettext('never'),

    format_expire: function(date) {
	if (!date) {
	    return PVE.Utils.neverText;
	}
	return Ext.Date.format(date, "Y-m-d");
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
		cta.push('Images');
	    } else if (ct === 'backup') {
		cta.push('Backups');
	    } else if (ct === 'vztmpl') {
		cta.push('Templates');
	    } else if (ct === 'iso') {
		cta.push('ISO');
	    } else if (ct === 'rootdir') {
		cta.push('Containers');
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
 
    openConoleWindow: function(vmtype, vmid, nodename, vmname) {
	var url = Ext.urlEncode({
	    console: vmtype, // kvm, openvz or shell
	    vmid: vmid,
	    vmname: vmname,
	    node: nodename
	});
	var nw = window.open("?" + url, '_blank', 
			     "innerWidth=745,innerheight=427");
	nw.focus();
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

