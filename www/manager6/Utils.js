Ext.ns('PVE');

// avoid errors related to Accessible Rich Internet Applications
// (access for people with disabilities)
// TODO reenable after all components are upgraded
Ext.enableAria = false;
Ext.enableAriaButtons = false;
Ext.enableAriaPanels = false;

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

Ext.define('PVE.Utils', { utilities: {

    // this singleton contains miscellaneous utilities

    toolkit: undefined, // (extjs|touch), set inside Toolkit.js

    bus_match: /^(ide|sata|virtio|scsi)\d+$/,

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
	'Linux': [
	    { desc: '4.X/3.X/2.6 Kernel', val: 'l26' },
	    { desc: '2.4 Kernel', val: 'l24' }
	],
	'Microsoft Windows': [
	    { desc: '10/2016', val: 'win10' },
	    { desc: '8.x/2012/2012r2', val: 'win8' },
	    { desc: '7/2008r2', val: 'win7' },
	    { desc: 'Vista/2008', val: 'w2k8' },
	    { desc: 'XP/2003', val: 'wxp' },
	    { desc: '2000', val: 'w2k' }
	],
	'Solaris Kernel': [
	    { desc: '-', val: 'solaris'}
	],
	'Other': [
	    { desc: '-', val: 'other'}
	]
    },

    get_health_icon: function(state, circle) {
	if (circle === undefined) {
	    circle = false;
	}

	if (state === undefined) {
	    state = 'uknown';
	}

	var icon = 'faded fa-question';
	switch(state) {
	    case 'good':
		icon = 'good fa-check';
		break;
	    case 'warning':
		icon = 'warning fa-exclamation';
		break;
	    case 'critical':
		icon = 'critical fa-times';
		break;
	    default: break;
	}

	if (circle) {
	    icon += '-circle';
	}

	return icon;
    },

    map_ceph_health: {
	'HEALTH_OK':'good',
	'HEALTH_WARN':'warning',
	'HEALTH_ERR':'critical'
    },

    render_ceph_health: function(healthObj) {
	var state = {
	    iconCls: PVE.Utils.get_health_icon(),
	    text: ''
	};

	if (!healthObj || !healthObj.status) {
	    return state;
	}

	var health = PVE.Utils.map_ceph_health[healthObj.status];

	state.iconCls = PVE.Utils.get_health_icon(health, true);
	state.text = healthObj.status;

	return state;
    },

    get_kvm_osinfo: function(value) {
	var info = { base: 'Other' }; // default
	if (value) {
	    Ext.each(Object.keys(PVE.Utils.kvm_ostypes), function(k) {
		Ext.each(PVE.Utils.kvm_ostypes[k], function(e) {
		    if (e.val === value) {
			info = { desc: e.desc, base: k };
		    }
		});
	    });
	}
	return info;
    },

    render_kvm_ostype: function (value) {
	var osinfo = PVE.Utils.get_kvm_osinfo(value);
	if (osinfo.desc && osinfo.desc !== '-') {
	    return osinfo.base + ' ' + osinfo.desc;
	} else {
	    return osinfo.base;
	}
    },

    render_hotplug_features: function (value) {
	var fa = [];

	if (!value || (value === '0')) {
	    return gettext('Disabled');
	}

	if (value === '1') {
	    value = 'disk,network,usb';
	}

	Ext.each(value.split(','), function(el) {
	    if (el === 'disk') {
		fa.push(gettext('Disk'));
	    } else if (el === 'network') {
		fa.push(gettext('Network'));
	    } else if (el === 'usb') {
		fa.push('USB');
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

    render_qemu_bios: function(value) {
	if (!value) {
	    return Proxmox.Utils.defaultText + ' (SeaBIOS)';
	} else if (value === 'seabios') {
	    return "SeaBIOS";
	} else if (value === 'ovmf') {
	    return "OVMF (UEFI)";
	} else {
	    return value;
	}
    },

    render_scsihw: function(value) {
	if (!value) {
	    return Proxmox.Utils.defaultText + ' (LSI 53C895A)';
	} else if (value === 'lsi') {
	    return 'LSI 53C895A';
	} else if (value === 'lsi53c810') {
	    return 'LSI 53C810';
	} else if (value === 'megasas') {
	    return 'MegaRAID SAS 8708EM2';
	} else if (value === 'virtio-scsi-pci') {
	    return 'VirtIO SCSI';
	} else if (value === 'virtio-scsi-single') {
	    return 'VirtIO SCSI single';
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
	'en-us': 'English (USA)',
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
	vmware: gettext('VMware compatible'),
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
	if (!value || value === '__default__') {
	    return Proxmox.Utils.defaultText;
	}
	var text = PVE.Utils.kvm_keymaps[value];
	if (text) {
	    return text + ' (' + value + ')';
	}
	return value;
    },

    kvm_keymap_array: function() {
	var data = [['__default__', PVE.Utils.render_kvm_language('')]];
	Ext.Object.each(PVE.Utils.kvm_keymaps, function(key, value) {
	    data.push([key, PVE.Utils.render_kvm_language(value)]);
	});

	return data;
    },

    render_console_viewer: function(value) {
	if (!value || value === '__default__') {
	    return Proxmox.Utils.defaultText + ' (HTML5)';
	} else if (value === 'vv') {
	    return  'SPICE (remote-viewer)';
	} else if (value === 'html5') {
	    return  'HTML5 (noVNC)';
	} else {
	    return value;
	}
    },

    render_kvm_vga_driver: function (value) {
	if (!value) {
	    return Proxmox.Utils.defaultText;
	}
	var text = PVE.Utils.kvm_vga_drivers[value];
	if (text) {
	    return text + ' (' + value + ')';
	}
	return value;
    },

    kvm_vga_driver_array: function() {
	var data = [['__default__', PVE.Utils.render_kvm_vga_driver('')]];
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
	    msg = Proxmox.Utils.extractRequestError(action.result, true);
	    break;
	}
	return msg;
    },

    format_duration_short: function(ut) {

	if (ut < 60) {
	    return ut.toFixed(1) + 's';
	}

	if (ut < 3600) {
	    var mins = ut / 60;
	    return mins.toFixed(1) + 'm';
	}

	if (ut < 86400) {
	    var hours = ut / 3600;
	    return hours.toFixed(1) + 'h';
	}

	var days = ut / 86400;
	return days.toFixed(1) + 'd';
    },

    imagesText: gettext('Disk image'),
    backupFileText: gettext('VZDump backup file'),
    vztmplText: gettext('Container template'),
    isoImageText: gettext('ISO image'),
    containersText: gettext('Container'),

    format_storage_type: function(value, md, record) {
	if (value === 'rbd' && record) {
	    value = (record.get('monhost')?'rbd_ext':'pveceph');
	}
	if (value === 'dir') {
	    return Proxmox.Utils.directoryText;
	} else if (value === 'nfs') {
	    return 'NFS';
	} else if (value === 'glusterfs') {
	    return 'GlusterFS';
	} else if (value === 'lvm') {
	    return 'LVM';
	} else if (value === 'lvmthin') {
	    return 'LVM-Thin';
	} else if (value === 'iscsi') {
	    return 'iSCSI';
	} else if (value === 'rbd') {
	    return 'RBD';
	} else if (value === 'rbd_ext') {
	    return 'RBD (external)';
	} else if (value === 'pveceph') {
	    return 'RBD (PVE)';
	} else if (value === 'sheepdog') {
	    return 'Sheepdog';
	} else if (value === 'zfs') {
	    return 'ZFS over iSCSI';
	} else if (value === 'zfspool') {
	    return 'ZFS';
	} else if (value === 'iscsidirect') {
	    return 'iSCSIDirect';
	} else if (value === 'drbd') {
	    return 'DRBD';
	} else {
	    return Proxmox.Utils.unknownText;
	}
    },

    format_ha: function(value) {
	var text = Proxmox.Utils.noneText;

	if (value.managed) {
	    text = value.state || Proxmox.Utils.noneText;

	    text += ', ' +  Proxmox.Utils.groupText + ': ';
	    text += value.group || Proxmox.Utils.noneText;
	}

	return text;
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

	return Proxmox.Utils.format_size(value);
    },

    render_bandwidth: function(value) {
	if (!Ext.isNumeric(value)) {
	    return '';
	}

	return Proxmox.Utils.format_size(value) + '/s';
    },

    render_timestamp_human_readable: function(value) {
	return Ext.Date.format(new Date(value * 1000), 'l d F Y H:i:s');
    },

    render_duration: function(value) {
	if (value === undefined) {
	    return '-';
	}
	return PVE.Utils.format_duration_short(value);
    },

    calculate_mem_usage: function(data) {
	if (!Ext.isNumeric(data.mem) ||
	    data.maxmem === 0 ||
	    data.uptime < 1) {
	    return -1;
	}

	return (data.mem / data.maxmem);
    },

    render_mem_usage_percent: function(value, metaData, record, rowIndex, colIndex, store) {
	if (!Ext.isNumeric(value) || value === -1) {
	    return '';
	}
	if (value > 1 ) {
	    // we got no percentage but bytes
	    var mem = value;
	    var maxmem = record.data.maxmem;
	    if (!record.data.uptime ||
		maxmem === 0 ||
		!Ext.isNumeric(mem)) {
		return '';
	    }

	    return ((mem*100)/maxmem).toFixed(1) + " %";
	}
	return (value*100).toFixed(1) + " %";
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

	return PVE.Utils.render_size(value);
    },

    calculate_disk_usage: function(data) {

	if (!Ext.isNumeric(data.disk) ||
	    data.type === 'qemu' ||
	    (data.type === 'lxc' && data.uptime === 0) ||
	    data.maxdisk === 0) {
	    return -1;
	}

	return (data.disk / data.maxdisk);
    },

    render_disk_usage_percent: function(value, metaData, record, rowIndex, colIndex, store) {
	if (!Ext.isNumeric(value) || value === -1) {
	    return '';
	}

	return (value * 100).toFixed(1) + " %";
    },

    render_disk_usage: function(value, metaData, record, rowIndex, colIndex, store) {

	var disk = value;
	var maxdisk = record.data.maxdisk;
	var type = record.data.type;

	if (!Ext.isNumeric(disk) ||
	    type === 'qemu' ||
	    maxdisk === 0 ||
	    (type === 'lxc' && record.data.uptime === 0)) {
	    return '';
	}

	return PVE.Utils.render_size(value);
    },

    get_object_icon_class: function(type, record) {
	var status = '';
	var objType = type;

	if (type === 'type') {
	    // for folder view
	    objType = record.groupbyid;
	} else if (record.template) {
	    // templates
	    objType = 'template';
	    status = type;
	} else {
	    // everything else
	    status = record.status + ' ha-' + record.hastate;
	}

	var defaults = PVE.tree.ResourceTree.typeDefaults[objType];
	if (defaults && defaults.iconCls) {
	    var retVal = defaults.iconCls + ' ' + status;
	    return retVal;
	}

	return '';
    },

    render_resource_type: function(value, metaData, record, rowIndex, colIndex, store) {

	var cls = PVE.Utils.get_object_icon_class(value,record.data);

	var fa = '<i class="fa-fw x-grid-icon-custom ' + cls  + '"></i> ';
	return fa + value;
    },

    render_support_level: function(value, metaData, record) {
	return PVE.Utils.support_level_hash[value] || '-';
    },

    render_upid: function(value, metaData, record) {
	var type = record.data.type;
	var id = record.data.id;

	return Proxmox.Utils.format_task_description(type, id);
    },

    /* render functions for new status panel */

    render_usage: function(val) {
	return (val*100).toFixed(2) + '%';
    },

    render_cpu_usage: function(val, max) {
	return Ext.String.format(gettext('{0}% of {1}') +
	    ' ' + gettext('CPU(s)'), (val*100).toFixed(2), max);
    },

    render_size_usage: function(val, max) {
	if (max === 0) {
	    return gettext('N/A');
	}
	return (val*100/max).toFixed(2) + '% '+ '(' +
	    Ext.String.format(gettext('{0} of {1}'),
	    PVE.Utils.render_size(val), PVE.Utils.render_size(max)) + ')';
    },

    /* this is different for nodes */
    render_node_cpu_usage: function(value, record) {
	return PVE.Utils.render_cpu_usage(value, record.cpus);
    },

    /* this is different for nodes */
    render_node_size_usage: function(record) {
	return PVE.Utils.render_size_usage(record.used, record.total);
    },

    windowHostname: function() {
	return window.location.hostname.replace(Proxmox.Utils.IP6_bracket_match,
            function(m, addr, offset, original) { return addr; });
    },

    openDefaultConsoleWindow: function(allowSpice, vmtype, vmid, nodename, vmname) {
	var dv = PVE.Utils.defaultViewer(allowSpice);
	PVE.Utils.openConsoleWindow(dv, vmtype, vmid, nodename, vmname);
    },

    openConsoleWindow: function(viewer, vmtype, vmid, nodename, vmname) {
	// kvm, lxc, shell, upgrade

	if (vmid == undefined && (vmtype === 'kvm' || vmtype === 'lxc')) {
	    throw "missing vmid";
	}

	if (!nodename) {
	    throw "no nodename specified";
	}

	if (viewer === 'html5') {
	    PVE.Utils.openVNCViewer(vmtype, vmid, nodename, vmname);
	} else if (viewer === 'xtermjs') {
	    Proxmox.Utils.openXtermJsViewer(vmtype, vmid, nodename, vmname);
	} else if (viewer === 'vv') {
	    var url;
	    var params = { proxy: PVE.Utils.windowHostname() };
	    if (vmtype === 'kvm') {
		url = '/nodes/' + nodename + '/qemu/' + vmid.toString() + '/spiceproxy';
		PVE.Utils.openSpiceViewer(url, params);
	    } else if (vmtype === 'lxc') {
		url = '/nodes/' + nodename + '/lxc/' + vmid.toString() + '/spiceproxy';
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

    openVNCViewer: function(vmtype, vmid, nodename, vmname) {
	var url = Ext.urlEncode({
	    console: vmtype, // kvm, lxc, upgrade or shell
	    novnc: 1,
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

	Proxmox.Utils.API2Request({
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

    openTreeConsole: function(tree, record, item, index, e) {
	e.stopEvent();
	var nodename = record.data.node;
	var vmid = record.data.vmid;
	var vmname = record.data.name;
	if (record.data.type === 'qemu' && !record.data.template) {
	    Proxmox.Utils.API2Request({
		url: '/nodes/' + nodename + '/qemu/' + vmid + '/status/current',
		failure: function(response, opts) {
		    Ext.Msg.alert('Error', response.htmlStatus);
		},
		success: function(response, opts) {
		    var allowSpice = response.result.data.spice;
		    PVE.Utils.openDefaultConsoleWindow(allowSpice, 'kvm', vmid, nodename, vmname);
		}
	    });
	} else if (record.data.type === 'lxc' && !record.data.template) {
	    PVE.Utils.openDefaultConsoleWindow(true, 'lxc', vmid, nodename, vmname);
	}
    },

    // test automation helper
    call_menu_handler: function(menu, text) {

	var list = menu.query('menuitem');

	Ext.Array.each(list, function(item) {
	    if (item.text === text) {
		if (item.handler) {
		    item.handler();
		    return 1;
		} else {
		    return undefined;
		}
	    }
	});
    },

    createCmdMenu: function(v, record, item, index, event) {
	event.stopEvent();
	if (!(v instanceof Ext.tree.View)) {
	    v.select(record);
	}
	var menu;

	if (record.data.type === 'qemu' && !record.data.template) {
	    menu = Ext.create('PVE.qemu.CmdMenu', {
		pveSelNode: record
	    });
	} else if (record.data.type === 'qemu' && record.data.template) {
	    menu = Ext.create('PVE.qemu.TemplateMenu', {
		pveSelNode: record
	    });
	} else if (record.data.type === 'lxc' && !record.data.template) {
	    menu = Ext.create('PVE.lxc.CmdMenu', {
		pveSelNode: record
	    });
	} else if (record.data.type === 'lxc' && record.data.template) {
	    /* since clone does not work reliably, disable for now
	    menu = Ext.create('PVE.lxc.TemplateMenu', {
		pveSelNode: record
	    });
	    */
	    return;

	} else if (record.data.type === 'node' ){
	    menu = Ext.create('PVE.node.CmdMenu', {
		nodename: record.data.node
	    });

	} else {
	    return;
	}

	menu.showAt(event.getXY());
    },

    // helper for deleting field which are set to there default values
    delete_if_default: function(values, fieldname, default_val, create) {
	if (values[fieldname] === '' || values[fieldname] === default_val) {
	    if (!create) {
		if (values['delete']) {
		    values['delete'] += ',' + fieldname;
		} else {
		    values['delete'] = fieldname;
		}
	    }

	    delete values[fieldname];
	}
    }
},

    singleton: true,
    constructor: function() {
	var me = this;
	Ext.apply(me, me.utilities);
    }

});

