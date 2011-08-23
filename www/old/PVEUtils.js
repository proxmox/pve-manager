// avoid errors when running without development tools
if (typeof console == "undefined") {
   var console = { 
       dir: function() {}, 
       log: function() {} 
   };
}

Ext.ns("PVE");

Ext.Ajax.defaultHeaders = {
    'Accept': 'application/json'
};

Ext.Ajax.on('beforerequest', function(conn, options) {
    if (PVECSRFPreventionToken) {
	if (!options.headers) 
	    options.headers = {};
	options.headers['CSRFPreventionToken'] = PVECSRFPreventionToken;
    }
});

// do not send '_dc' parameter
Ext.Ajax.disableCaching = false;

Ext.Ajax.on('requestexception', function(conn, response, options) {
    if (response.status == 401) {
	PVE.Workspace.showLogin();
    }
});

// custom Vtype for vtype:'IPAddress'
Ext.apply(Ext.form.VTypes, {
    IPAddress:  function(v) {
        return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v);
    },
    IPAddressText: 'Must be a numeric IP address',
    IPAddressMask: /[\d\.]/i
});

PVE.Utils = function() {

    var log_severity_hash = {
	0: "panic",
	1: "alert",
	2: "critical",
	3: "error",
	4: "warning",
	5: "notice",
	6: "info",
	7: "debug"
    };


    var utils = {

	authOK: function() {
	    return Ext.util.Cookies.get('PVEAuthCookie');
	},

	authClear: function() {
	    Ext.util.Cookies.clear("PVEAuthCookie");
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

	    return log_severity_hash[value] || value;
	},

	render_upid: function(value, metaData, record) { 
	    var type = record.data.type;
	    var id = record.data.id;

	    if (type == 'vncproxy') {
		return "VNC connection to VM " + id;
	    }
	    if (type == 'vncshell') {
		return "VNC shell";
	    }

	    return value;
	},
			  
	render_cpu: function(value, metaData, record, rowIndex, colIndex, store) {

	    var cpu = value;
	    var maxcpu = record.data.maxcpu;

	    if (cpu === undefined || maxcpu === undefined)
		return ''

	    var per = (cpu * 100) / maxcpu;

	    return PVE.Utils.format_html_bar(per, per.toFixed(0) + '% of ' + 
					     maxcpu + (maxcpu > 1 ? 'CPUs' : 'CPU'));
	},

	render_mem: function(value, metaData, record, rowIndex, colIndex, store) {

	    var mem = value;
	    var maxmem = record.data.maxmem;
	    
	    if (record.data.itype == 'storage' || mem === undefined || maxmem === undefined)
		return ''

	    return PVE.Utils.format_html_bar((mem * 100) / maxmem, 
					     PVE.Utils.format_size(mem));

	},

	render_disk: function(value, metaData, record, rowIndex, colIndex, store) {

	    var disk = value;
	    var maxdisk = record.data.maxdisk;

	    if (disk === undefined || maxdisk === undefined)
		return ''

	    return PVE.Utils.format_html_bar((disk * 100) / maxdisk, 
					     PVE.Utils.format_size(disk));
	},

	render_itype: function(value, metaData, record, rowIndex, colIndex, store) {

	    var cls = 'pve-itype-icon-' + value;

	    return "<div class='" + cls + "'</div><div>" + value + "</div>";
	},

	render_uptime: function(value, metaData, record, rowIndex, colIndex, store) {

	    var uptime = value;

	    if (uptime === undefined)
		return '';
	    
	    if (uptime <= 0)
		return '-';

	    return PVE.Utils.format_duration_long(uptime);
	},

	dummy: "ignore me"
    };

    var field_defaults = {
	itype: {
	    header: 'Type',
	    type: 'text',
	    renderer: utils.render_itype,
	    width: 50
	},
	id: {
	    header: 'ID',
	    hidden: true,
	    type: 'text'
	},
	name: {
	    header: 'Name',
	    type: 'text'
	},
	disk: {
	    header: 'Disk',
	    type: 'integer',
	    renderer: utils.render_disk,
	    width: 60
	},
	maxdisk: {
	    header: 'maxdisk',
	    type:'integer',
	    hidden: true,
	    width: 60
	},
	mem: {
	    header: 'Memory',
	    type: 'integer',
	    renderer: utils.render_mem,
	    width: 60
	},
	maxmem: {
	    header: 'maxmem',
	    type:'integer',
	    hidden: true,
	    width: 60
	},
	cpu: {
	    header: 'CPU',
	    type:'float',
	    renderer: utils.render_cpu,
	    width: 85
	},
	maxcpu: {
	    header: 'maxcpu',
	    type:'integer',
	    hidden: true,
	    width: 60
	},
	uptime: {
	    header: 'Uptime',
	    type:'integer',
	    renderer: utils.render_uptime,
	    width: 110
	}, 
	node: {
	    header: 'Node',
	    type: 'text',
	    hidden: true,
	    width: 110
	},
	storage: {
	    header: 'Storage',
	    type: 'text',
	    hidden: true,
	    width: 110
	},
	shared: {
	    header: 'Shared',
	    type: 'boolean',
	    hidden: true,
	    width: 60
	}
    };

    var visible_fields = function() {
	var res = {};
	for (field in field_defaults) {
	    if (!field_defaults[field].hidden) 
		res[field] = true;
	}
	return res;
    }();

    utils.getFields = function() {
	return Ext.apply({}, field_defaults);
    };

    utils.base_fields = function() {
	var res = [];
	for (field in field_defaults) {
	    res.push(field);
	}
	return res;
    }();

    utils.get_field_defaults = function(fieldlist) {

	var res = [];

	Ext.each(fieldlist, function(field) {
	    var info = field_defaults[field];
	    if (!info)
		throw "no such field '" + field + "'";
	    var fi = { name: field };

	    if (info.type)
		fi.type = info.type;
	    
	    res.push(fi);
	});

	return res;
    };

    utils.default_view = 'server';

    utils.default_views = {
	custom: {
	    text: 'Custom View',
	    fields: Ext.apply({}, visible_fields),
	    groups: []
	},
	folder: {
	    text: 'Folder View',
	    fields: Ext.apply({}, visible_fields),
	    groups: ['itype']
	},
	server: {
	    text: 'Server View',
	    fields: Ext.apply({}, visible_fields),
	    groups: ['node']
	},
	storage: {
	    text: 'Storage View',
	    fields: Ext.apply({}, visible_fields),
	    groups: ['node'],
	    filterfn: function(n, itype) {
		return itype === 'storage';
	    }
	}
    };

    utils.changeViewDefaults = function(view, viewinfo) {
	console.log("change view defaults" + view);
	utils.default_views[view].fields = 
	    Ext.apply({}, viewinfo.fields);
	utils.default_views[view].groups = 
	    [].concat(viewinfo.groups);
    };

    utils.get_column_defaults = function(view) {

	var res = [];

	var viewinfo = utils.default_views[view];

	for (field in field_defaults) {
	    var info = field_defaults[field];
	    var fi = { header: info.header, dataIndex: field };

	    if (info.renderer)
		fi.renderer = info.renderer;
	    if (info.width)
		fi.width = info.width;
	    if (!viewinfo.fields[field])
		fi.hidden = true;
	    
	    res.push(fi);
	}

	return res;
    };

    return utils;

}();

