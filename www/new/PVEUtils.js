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
	if (!options.headers) 
	    options.headers = {};
	options.headers['CSRFPreventionToken'] = PVE.CSRFPreventionToken;
    }
});

// custom Vtype for vtype:'IPAddress'
Ext.apply(Ext.form.field.VTypes, {
    IPAddress:  function(v) {
        return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v);
    },
    IPAddressText: 'Must be a numeric IP address',
    IPAddressMask: /[\d\.]/i,

    BridgeName: function(v) {
        return /^vmbr\d{1,4}$/.test(v);
    },
    BridgeNameText: 'Allowable bridge names: vmbr<b>N</b>, where 0 <= <b>N</b> <= 9999',

    BondName: function(v) {
        return /^bond\d{1,4}$/.test(v);
    },
    BondNameText: 'Allowable bond names: bond<b>N</b>, where 0 <= <b>N</b> <= 9999'
   
});

 

Ext.define('PVE.Utils', {
    singleton: true,

    statics: {

	log_severity_hash: {
	    0: "panic",
	    1: "alert",
	    2: "critical",
	    3: "error",
	    4: "warning",
	    5: "notice",
	    6: "info",
	    7: "debug"
	}
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
	    var msg = "Unknown error";
	    if (result.message) {
		msg = result.message;
		if (result.status)
		    msg += ' (' + result.status + ')';
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
	    if (resp.status && resp.statusText)
		msg += " " + resp.status + ": " + resp.statusText;
	    break;
	case Ext.form.action.Action.LOAD_FAILURE:
	case Ext.form.action.Action.SERVER_INVALID:
	    msg = PVE.Utils.extractRequestError(action.result, true);
	    break;
	}
	return msg;
    },

    // Ext.Ajax.request
    API2Request: function(options) {
	var callbackFn = options.callback;
	var successFn = options.success;
	var failureFn = options.failure;

	options.url = '/api2/extjs' + options.url;

	delete options.callback;

	options.success = function(response, options) {
	    var result = Ext.decode(response.responseText);
	    if (!result.success) {
		response.htmlStatus = PVE.Utils.extractRequestError(result, true);
		Ext.callback(callbackFn, options.scope, [options, false, response])
		Ext.callback(failureFn, options.scope, [response, options])
		return;
	    }
	    Ext.callback(callbackFn, options.scope, [options, true, response])
	    Ext.callback(successFn, options.scope, [response, options])
	};

	options.failure = function(response, options) {
	    var msg = "Connection error - server offline?";
	    if (response.status && response.statusText)
		msg = "Connection error " + response.status + ": " + response.statusText;
	    response.htmlStatus = msg;
	    Ext.callback(callbackFn, options.scope, [options, false, response])
	    Ext.callback(failureFn, options.scope, [response, options])
	};

	Ext.Ajax.request(options);
    },

    assemble_field_data: function(values, data) {
        if (Ext.isObject(data)) {
            Ext.iterate(data, function(name, val) {
                if (name in values) {
                    var bucket = values[name],
                    isArray = Ext.isArray;
                    if (!isArray(bucket)) {
                        bucket = values[name] = [bucket];
                    }
                    if (isArray(val)) {
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

    format_task_description: function(type, id) {

	if (type == 'vncproxy')
	    return "VNC connection to VM " + id;

	if (type == 'vncshell')
	    return "VNC shell";

	return type;
    },


    parse_task_upid: function(upid) {
	var task = {};

	var res = upid.match(/^UPID:(\w+):([0-9A-Fa-f]{8}):([0-9A-Fa-f]{8}):([0-9A-Fa-f]{8}):([^:\s]+):([^:\s]*):([^:\s]+):$/);
	if (!res)
	    throw "unable to parse upid '" + upid + "'";

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

	if (kb < 1024)
	    return kb.toFixed(0) + "KB";

	var mb = size / (1024*1024);

	if (mb < 1024)
	    return mb.toFixed(0) + "MB";

	var gb = mb / 1024;

	if (gb < 1024)
	    return gb.toFixed(2) + "GB";

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

	if (!text)
	    text = per.toFixed(1) + "%";

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

	hours = "00" + hours;
	hours = hours.substr(hours.length - 2);
	mins = "00" + mins;
	mins = mins.substr(mins.length - 2);
	ut = "00" + ut;
	ut = ut.substr(ut.length - 2);

	if (days) {
	    var ds = days > 1 ? 'days' : 'day';
	    return days + ' ' + ds + ' ' + 
		hours + ':' + mins + ':' + ut;
	} else {
	    return hours + ':' + mins + ':' + ut;
	}
    },

    format_duration_short: function(ut) {
	
	if (ut < 60)
	    return ut + 's';

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
	var desc = {
	    dir: 'Directory',
	    nfs: 'NFS',
	    lvm: 'LVM',
	    iscsi: 'iSCSI'
	};
	return desc[value] || 'unknown';
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
	    if (ct === 'images')
		cta.push('Images');
	    if (ct === 'backup')
		cta.push('Backups');
	    if (ct === 'vztmpl')
		cta.push('Templates');
	    if (ct === 'iso')
		cta.push('ISO');
	});

	return cta.join(', ');
    },

    render_serverity: function (value) {
	return PVE.Utils.statics().log_severity_hash[value] || value;
    },

    render_cpu: function(value, metaData, record, rowIndex, colIndex, store) {

	var maxcpu = record.data.maxcpu;

	if (!record.data.uptime)
	    return '';

	if (!(Ext.isNumeric(value) && Ext.isNumeric(maxcpu) && (maxcpu >= 1)))
	    return ''

	var per = (value * 100) / maxcpu;

	return per.toFixed(1) + '% of ' + maxcpu + (maxcpu > 1 ? 'CPUs' : 'CPU');
    },

    render_size: function(value, metaData, record, rowIndex, colIndex, store) {

	if (!Ext.isNumeric(value))
	    return '';

	return PVE.Utils.format_size(value);
    },

    render_timestamp: function(value, metaData, record, rowIndex, colIndex, store) {
	var servertime = new Date(value * 1000);
	return Ext.Date.format(servertime, 'Y-m-d H:i:s');
    },

    render_mem_usage: function(value, metaData, record, rowIndex, colIndex, store) {

	var mem = value;
	var maxmem = record.data.maxmem;
	
	if (!record.data.uptime)
	    return '';

	if (!(Ext.isNumeric(mem) && maxmem))
	    return ''

	var per = (mem * 100) / maxmem;

	return per.toFixed(1) + '%';
    },

    render_disk_usage: function(value, metaData, record, rowIndex, colIndex, store) {

	var disk = value;
	var maxdisk = record.data.maxdisk;

	if (!(Ext.isNumeric(disk) && maxdisk))
	    return ''

	var per = (disk * 100) / maxdisk;

	return per.toFixed(1) + '%';
    },

    render_resource_type: function(value, metaData, record, rowIndex, colIndex, store) {

	var cls = 'pve-itype-icon-' + value;
	metaData.css = cls;
	return value;
    },

    render_uptime: function(value, metaData, record, rowIndex, colIndex, store) {

	var uptime = value;

	if (uptime === undefined)
	    return '';
	
	if (uptime <= 0)
	    return '-';

	return PVE.Utils.format_duration_long(uptime);
    },

    render_upid: function(value, metaData, record) { 
	var type = record.data.type;
	var id = record.data.id;

	return PVE.Utils.format_task_description(type, id);
    }
});

