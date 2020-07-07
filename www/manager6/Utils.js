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
	log: function() {}
    };
}
console.log("Starting PVE Manager");

Ext.Ajax.defaultHeaders = {
    'Accept': 'application/json'
};

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

    noSubKeyHtml: 'You do not have a valid subscription for this server. Please visit <a target="_blank" href="https://www.proxmox.com/products/proxmox-ve/subscription-service-plans">www.proxmox.com</a> to get a list of available options.',

    kvm_ostypes: {
	'Linux': [
	    { desc: '5.x - 2.6 Kernel', val: 'l26' },
	    { desc: '2.4 Kernel', val: 'l24' }
	],
	'Microsoft Windows': [
	    { desc: '10/2016/2019', val: 'win10' },
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
	    case 'upgrade':
		icon = 'warning fa-upload';
		break;
	    case 'old':
		icon = 'warning fa-refresh';
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

    parse_ceph_version: function(service) {
	if (service.ceph_version_short) {
	    return service.ceph_version_short;
	}

	if (service.ceph_version) {
	    var match = service.ceph_version.match(/version (\d+(\.\d+)*)/);
	    if (match) {
		return match[1];
	    }
	}

	return undefined;
    },

    compare_ceph_versions: function(a, b) {
	let avers = [];
	let bvers = [];

	if (a === b) {
	    return 0;
	}

	if (Ext.isArray(a)) {
	    avers = a.slice(); // copy array
	} else {
	    avers = a.toString().split('.');
	}

	if (Ext.isArray(b)) {
	    bvers = b.slice(); // copy array
	} else {
	    bvers = b.toString().split('.');
	}

	while (true) {
	    let av = avers.shift();
	    let bv = bvers.shift();

	    if (av === undefined && bv === undefined) {
		return 0;
	    } else if (av === undefined)  {
		return -1;
	    } else if (bv === undefined) {
		return 1;
	    } else {
		let diff = parseInt(av, 10) - parseInt(bv, 10);
		if (diff != 0) return diff;
		// else we need to look at the next parts
	    }
	}

    },

    get_ceph_icon_html: function(health, fw) {
	var state = PVE.Utils.map_ceph_health[health];
	var cls = PVE.Utils.get_health_icon(state);
	if (fw) {
	    cls += ' fa-fw';
	}
	return "<i class='fa " + cls + "'></i> ";
    },

    map_ceph_health: {
	'HEALTH_OK':'good',
	'HEALTH_UPGRADE':'upgrade',
	'HEALTH_OLD':'old',
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

    render_zfs_health: function(value) {
	if (typeof value == 'undefined'){
	    return "";
	}
	var iconCls = 'question-circle';
	switch (value) {
	    case 'AVAIL':
	    case 'ONLINE':
		iconCls = 'check-circle good';
		break;
	    case 'REMOVED':
	    case 'DEGRADED':
		iconCls = 'exclamation-circle warning';
		break;
	    case 'UNAVAIL':
	    case 'FAULTED':
	    case 'OFFLINE':
		iconCls = 'times-circle critical';
		break;
	    default: //unknown
	}

	return '<i class="fa fa-' + iconCls + '"></i> ' + value;

    },

    render_backup_status: function(value, meta, record) {
	if (typeof value == 'undefined') {
	    return "";
	}

	let iconCls = 'check-circle good';
	let text = gettext('Yes');

	if (!PVE.Parser.parseBoolean(value.toString())) {
	    iconCls = 'times-circle critical';

	    text = gettext('No');

	    let reason = record.get('reason');
	    if (typeof reason !== 'undefined') {
		if (reason in PVE.Utils.backup_reasons_table) {
		    reason = PVE.Utils.backup_reasons_table[record.get('reason')];
		}
		text = `${text} - ${reason}`;
	    }
	}

	return `<i class="fa fa-${iconCls}"></i> ${text}`;
    },

    render_backup_days_of_week: function(val) {
	var dows = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
	var selected = [];
	var cur = -1;
	val.split(',').forEach(function(day){
	    cur++;
	    var dow = (dows.indexOf(day)+6)%7;
	    if (cur === dow) {
		if (selected.length === 0 || selected[selected.length-1] === 0) {
		    selected.push(1);
		} else {
		    selected[selected.length-1]++;
		}
	    } else {
		while (cur < dow) {
		    cur++;
		    selected.push(0);
		}
		selected.push(1);
	    }
	});

	cur = -1;
	var days = [];
	selected.forEach(function(item) {
	    cur++;
	    if (item > 2) {
		days.push(Ext.Date.dayNames[(cur+1)] + '-' + Ext.Date.dayNames[(cur+item)%7]);
		cur += item-1;
	    } else if (item == 2) {
		days.push(Ext.Date.dayNames[cur+1]);
		days.push(Ext.Date.dayNames[(cur+2)%7]);
		cur++;
	    } else if (item == 1) {
		days.push(Ext.Date.dayNames[(cur+1)%7]);
	    }
	});
	return days.join(', ');
    },

    render_backup_selection: function(value, metaData, record) {
	let allExceptText = gettext('All except {0}');
	let allText = '-- ' + gettext('All') + ' --';
	if (record.data.all) {
	    if (record.data.exclude) {
		return Ext.String.format(allExceptText, record.data.exclude);
	    }
	    return allText;
	}
	if (record.data.vmid) {
	    return record.data.vmid;
	}

	if (record.data.pool) {
	    return "Pool '"+ record.data.pool + "'";
	}

	return "-";
    },

    backup_reasons_table: {
	'backup=yes': gettext('Enabled'),
	'backup=no': gettext('Disabled'),
	'enabled': gettext('Enabled'),
	'disabled': gettext('Disabled'),
	'not a volume': gettext('Not a volume'),
	'efidisk but no OMVF BIOS': gettext('EFI Disk without OMVF BIOS'),
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

    render_localtime: function(value) {
	if (value === '__default__') {
	    return Proxmox.Utils.defaultText + ' (' + gettext('Enabled for Windows') + ')';
	}
	return Proxmox.Utils.format_boolean(value);
    },

    render_qga_features: function(value) {
	if (!value) {
	    return Proxmox.Utils.defaultText + ' (' + Proxmox.Utils.disabledText  + ')';
	}
	var props = PVE.Parser.parsePropertyString(value, 'enabled');
	if (!PVE.Parser.parseBoolean(props.enabled)) {
	    return Proxmox.Utils.disabledText;
	}

	delete props.enabled;
	var agentstring = Proxmox.Utils.enabledText;

	Ext.Object.each(props, function(key, value) {
	    var keystring = '' ;
	    agentstring += ', ' + key + ': ';

	    if (key === 'type') {
		let map = {
		    isa: "ISA",
		    virtio: "VirtIO",
		};
	        agentstring += map[value] || Proxmox.Utils.unknownText;
	    } else {
		if (PVE.Parser.parseBoolean(value)) {
		    agentstring += Proxmox.Utils.enabledText;
		} else {
		    agentstring += Proxmox.Utils.disabledText;
		}
	    }
	});

	return agentstring;
    },

    render_qemu_machine: function(value) {
	return value || (Proxmox.Utils.defaultText + ' (i440fx)');
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

    render_dc_ha_opts: function(value) {
	if (!value) {
	    return Proxmox.Utils.defaultText;
	} else {
	    return PVE.Parser.printPropertyString(value);
	}
    },
    render_as_property_string: function(value) {
	return (!value) ? Proxmox.Utils.defaultText
	    : PVE.Parser.printPropertyString(value);
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

    render_spice_enhancements: function(values) {
	let props = PVE.Parser.parsePropertyString(values);
	if (Ext.Object.isEmpty(props)) {
	    return Proxmox.Utils.noneText;
	}

	let output = [];
	if (PVE.Parser.parseBoolean(props.foldersharing)) {
	    output.push('Folder Sharing: ' + gettext('Enabled'));
	}
	if (props.videostreaming === 'all' || props.videostreaming === 'filter') {
	    output.push('Video Streaming: ' + props.videostreaming);
	}
	return output.join(', ');
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
	serial3: gettext('Serial terminal') + ' 3',
	virtio: 'VirtIO-GPU',
	none: Proxmox.Utils.noneText
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

    console_map: {
	'__default__': Proxmox.Utils.defaultText + ' (xterm.js)',
	'vv': 'SPICE (remote-viewer)',
	'html5': 'HTML5 (noVNC)',
	'xtermjs': 'xterm.js'
    },

    render_console_viewer: function(value) {
	value = value || '__default__';
	if (PVE.Utils.console_map[value]) {
	    return PVE.Utils.console_map[value];
	}
	return value;
    },

    console_viewer_array: function() {
	return Ext.Array.map(Object.keys(PVE.Utils.console_map), function(v) {
	    return [v, PVE.Utils.render_console_viewer(v)];
	});
    },

    render_kvm_vga_driver: function (value) {
	if (!value) {
	    return Proxmox.Utils.defaultText;
	}
	var vga = PVE.Parser.parsePropertyString(value, 'type');
	var text = PVE.Utils.kvm_vga_drivers[vga.type];
	if (!vga.type) {
	    text = Proxmox.Utils.defaultText;
	}
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

    contentTypes: {
	'images': gettext('Disk image'),
	'backup': gettext('VZDump backup file'),
	'vztmpl': gettext('Container template'),
	'iso': gettext('ISO image'),
	'rootdir': gettext('Container'),
	'snippets': gettext('Snippets')
    },

    volume_is_qemu_backup: function(volid, format) {
	return format === 'pbs-vm' || volid.match(':backup/vzdump-qemu-');
    },

    volume_is_lxc_backup: function(volid, format) {
	return format === 'pbs-ct' || volid.match(':backup/vzdump-(lxc|openvz)-');
    },

    authSchema: {
	ad: {
	    name: gettext('Active Directory Server'),
	    ipanel: 'pveAuthADPanel',
	    syncipanel: 'pveAuthLDAPSyncPanel',
	    add: true,
	},
	ldap: {
	    name: gettext('LDAP Server'),
	    ipanel: 'pveAuthLDAPPanel',
	    syncipanel: 'pveAuthLDAPSyncPanel',
	    add: true,
	},
	pam: {
	    name: 'Linux PAM',
	    ipanel: 'pveAuthBasePanel',
	    add: false,
	},
	pve: {
	    name: 'Proxmox VE authentication server',
	    ipanel: 'pveAuthBasePanel',
	    add: false,
	},
    },

    storageSchema: {
	dir: {
	    name: Proxmox.Utils.directoryText,
	    ipanel: 'DirInputPanel',
	    faIcon: 'folder'
	},
	lvm: {
	    name: 'LVM',
	    ipanel: 'LVMInputPanel',
	    faIcon: 'folder'
	},
	lvmthin: {
	    name: 'LVM-Thin',
	    ipanel: 'LvmThinInputPanel',
	    faIcon: 'folder'
	},
	nfs: {
	    name: 'NFS',
	    ipanel: 'NFSInputPanel',
	    faIcon: 'building'
	},
	cifs: {
	    name: 'CIFS',
	    ipanel: 'CIFSInputPanel',
	    faIcon: 'building'
	},
	glusterfs: {
	    name: 'GlusterFS',
	    ipanel: 'GlusterFsInputPanel',
	    faIcon: 'building'
	},
	iscsi: {
	    name: 'iSCSI',
	    ipanel: 'IScsiInputPanel',
	    faIcon: 'building'
	},
	cephfs: {
	    name: 'CephFS',
	    ipanel: 'CephFSInputPanel',
	    faIcon: 'building'
	},
	pvecephfs: {
	    name: 'CephFS (PVE)',
	    ipanel: 'CephFSInputPanel',
	    hideAdd: true,
	    faIcon: 'building'
	},
	rbd: {
	    name: 'RBD',
	    ipanel: 'RBDInputPanel',
	    faIcon: 'building'
	},
	pveceph: {
	    name: 'RBD (PVE)',
	    ipanel: 'RBDInputPanel',
	    hideAdd: true,
	    faIcon: 'building'
	},
	zfs: {
	    name: 'ZFS over iSCSI',
	    ipanel: 'ZFSInputPanel',
	    faIcon: 'building'
	},
	zfspool: {
	    name: 'ZFS',
	    ipanel: 'ZFSPoolInputPanel',
	    faIcon: 'folder'
	},
	pbs: {
	    name: 'Proxmox Backup Server',
	    ipanel: 'PBSInputPanel',
	    faIcon: 'floppy-o',
	},
	drbd: {
	    name: 'DRBD',
	    hideAdd: true,
	},
    },

    sdnvnetSchema: {
	vnet: {
	    name: 'vnet',
	    faIcon: 'folder'
	},
    },

    sdnzoneSchema: {
	zone: {
	     name: 'zone',
	     hideAdd: true
	},
	simple: {
	    name: 'Simple',
	    ipanel: 'SimpleInputPanel',
	    faIcon: 'th'
	},
	vlan: {
	    name: 'VLAN',
	    ipanel: 'VlanInputPanel',
	    faIcon: 'th'
	},
	qinq: {
	    name: 'QinQ',
	    ipanel: 'QinQInputPanel',
	    faIcon: 'th'
	},
	vxlan: {
	    name: 'VXLAN',
	    ipanel: 'VxlanInputPanel',
	    faIcon: 'th'
	},
	evpn: {
	    name: 'EVPN',
	    ipanel: 'EvpnInputPanel',
	    faIcon: 'th'
	},
    },

    sdncontrollerSchema: {
	controller: {
	     name: 'controller',
	     hideAdd: true
	},
	evpn: {
	    name: 'evpn',
	    ipanel: 'EvpnInputPanel',
	    faIcon: 'crosshairs'
	},
    },

    format_sdnvnet_type: function(value, md, record) {
	var schema = PVE.Utils.sdnvnetSchema[value];
	if (schema) {
	    return schema.name;
	}
	return Proxmox.Utils.unknownText;
    },

    format_sdnzone_type: function(value, md, record) {
	var schema = PVE.Utils.sdnzoneSchema[value];
	if (schema) {
	    return schema.name;
	}
	return Proxmox.Utils.unknownText;
    },

    format_sdncontroller_type: function(value, md, record) {
	var schema = PVE.Utils.sdncontrollerSchema[value];
	if (schema) {
	    return schema.name;
	}
	return Proxmox.Utils.unknownText;
    },

    format_storage_type: function(value, md, record) {
	if (value === 'rbd') {
	    value = (!record || record.get('monhost') ? 'rbd' : 'pveceph');
	} else if (value === 'cephfs') {
	    value = (!record || record.get('monhost') ? 'cephfs' : 'pvecephfs');
	}

	var schema = PVE.Utils.storageSchema[value];
	if (schema) {
	    return schema.name;
	}
	return Proxmox.Utils.unknownText;
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
	return value.split(',').sort().map(function(ct) {
	    return PVE.Utils.contentTypes[ct] || ct;
	}).join(', ');
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
	return data.volid.replace(/^.*?:(.*?\/)?/,'');
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

	if (record.lock) {
	    status += ' locked lock-' + record.lock;
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

    render_optional_url: function(value) {
	var match;
	if (value && (match = value.match(/^https?:\/\//)) !== null) {
	    return '<a target="_blank" href="' + value + '">' + value + '</a>';
	}
	return value;
    },

    render_san: function(value) {
	var names = [];
	if (Ext.isArray(value)) {
	    value.forEach(function(val) {
		if (!Ext.isNumber(val)) {
		    names.push(val);
		}
	    });
	    return names.join('<br>');
	}
	return value;
    },

    render_full_name: function(firstname, metaData, record) {
	var first = firstname || '';
	var last = record.data.lastname || '';
	return Ext.htmlEncode(first + " " + last);
    },

    render_u2f_error: function(error) {
	var ErrorNames = {
	    '1': gettext('Other Error'),
	    '2': gettext('Bad Request'),
	    '3': gettext('Configuration Unsupported'),
	    '4': gettext('Device Ineligible'),
	    '5': gettext('Timeout')
	};
	return "U2F Error: "  + ErrorNames[error] || Proxmox.Utils.unknownText;
    },

    windowHostname: function() {
	return window.location.hostname.replace(Proxmox.Utils.IP6_bracket_match,
            function(m, addr, offset, original) { return addr; });
    },

    openDefaultConsoleWindow: function(consoles, consoleType, vmid, nodename, vmname, cmd) {
	var dv = PVE.Utils.defaultViewer(consoles);
	PVE.Utils.openConsoleWindow(dv, consoleType, vmid, nodename, vmname, cmd);
    },

    openConsoleWindow: function(viewer, consoleType, vmid, nodename, vmname, cmd) {
	if (vmid == undefined && (consoleType === 'kvm' || consoleType === 'lxc')) {
	    throw "missing vmid";
	}
	if (!nodename) {
	    throw "no nodename specified";
	}

	if (viewer === 'html5') {
	    PVE.Utils.openVNCViewer(consoleType, vmid, nodename, vmname, cmd);
	} else if (viewer === 'xtermjs') {
	    Proxmox.Utils.openXtermJsViewer(consoleType, vmid, nodename, vmname, cmd);
	} else if (viewer === 'vv') {
	    let url = '/nodes/' + nodename + '/spiceshell';
	    let params = {
		proxy: PVE.Utils.windowHostname(),
	    };
	    if (consoleType === 'kvm') {
		url = '/nodes/' + nodename + '/qemu/' + vmid.toString() + '/spiceproxy';
	    } else if (consoleType === 'lxc') {
		url = '/nodes/' + nodename + '/lxc/' + vmid.toString() + '/spiceproxy';
	    } else if (consoleType === 'upgrade') {
		params.cmd = 'upgrade';
	    } else if (consoleType === 'cmd') {
		params.cmd = cmd;
	    } else if (consoleType !== 'shell') {
		throw `unknown spice viewer type '${consoleType}'`;
	    }
	    PVE.Utils.openSpiceViewer(url, params);
	} else {
	    throw `unknown viewer type '${viewer}'`;
	}
    },

    defaultViewer: function(consoles) {

	var allowSpice, allowXtermjs;

	if (consoles === true) {
	    allowSpice = true;
	    allowXtermjs = true;
	} else if (typeof consoles === 'object') {
	    allowSpice = consoles.spice;
	    allowXtermjs = !!consoles.xtermjs;
	}
	var dv = PVE.VersionInfo.console || 'xtermjs';
	if (dv === 'vv' && !allowSpice) {
	    dv = (allowXtermjs) ? 'xtermjs' : 'html5';
	} else if (dv === 'xtermjs' && !allowXtermjs) {
	    dv = (allowSpice) ? 'vv' : 'html5';
	}

	return dv;
    },

    openVNCViewer: function(vmtype, vmid, nodename, vmname, cmd) {
	let scaling = 'off';
	if (Proxmox.Utils.toolkit !== 'touch') {
	    var sp = Ext.state.Manager.getProvider();
	    scaling = sp.get('novnc-scaling', 'off');
	}
	var url = Ext.Object.toQueryString({
	    console: vmtype, // kvm, lxc, upgrade or shell
	    novnc: 1,
	    vmid: vmid,
	    vmname: vmname,
	    node: nodename,
	    resize: scaling,
	    cmd: cmd
	});
	var nw = window.open("?" + url, '_blank', "innerWidth=745,innerheight=427");
	if (nw) {
	    nw.focus();
	}
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
		let evt = document.createEvent("MouseEvents");
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
		    let conf = response.result.data;
		    var consoles = {
			spice: !!conf.spice,
			xtermjs: !!conf.serial,
		    };
		    PVE.Utils.openDefaultConsoleWindow(consoles, 'kvm', vmid, nodename, vmname);
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
	var template = !!record.data.template;
	var type = record.data.type;

	if (template) {
	    if (type === 'qemu' || type == 'lxc') {
		menu = Ext.create('PVE.menu.TemplateMenu', {
		    pveSelNode: record
		});
	    }
	} else if (type === 'qemu' ||
		   type === 'lxc' ||
		   type === 'node') {
	    menu = Ext.create('PVE.' + type + '.CmdMenu', {
		pveSelNode: record,
		nodename: record.data.node
	    });
	} else {
	    return;
	}

	menu.showAt(event.getXY());
	return menu;
    },

    // helper for deleting field which are set to there default values
    delete_if_default: function(values, fieldname, default_val, create) {
	if (values[fieldname] === '' || values[fieldname] === default_val) {
	    if (!create) {
		if (values['delete']) {
		    if (Ext.isArray(values['delete'])) {
			values['delete'].push(fieldname);
		    } else {
			values['delete'] += ',' + fieldname;
		    }
		} else {
		    values['delete'] = fieldname;
		}
	    }

	    delete values[fieldname];
	}
    },

    loadSSHKeyFromFile: function(file, callback) {
	// ssh-keygen produces 740 bytes for an average 4096 bit rsa key, with
	// a user@host comment, 1420 for 8192 bits; current max is 16kbit
	// assume: 740*8 for max. 32kbit (5920 byte file)
	// round upwards to nearest nice number => 8192 bytes, leaves lots of comment space
	if (file.size > 8192) {
	    Ext.Msg.alert(gettext('Error'), gettext("Invalid file size: ") + file.size);
	    return;
	}
	/*global
	  FileReader
	*/
	var reader = new FileReader();
	reader.onload = function(evt) {
	    callback(evt.target.result);
	};
	reader.readAsText(file);
    },

    diskControllerMaxIDs: {
	ide: 4,
	sata: 6,
	scsi: 31,
	virtio: 16,
    },

    // types is either undefined (all busses), an array of busses, or a single bus
    forEachBus: function(types, func) {
	var busses = Object.keys(PVE.Utils.diskControllerMaxIDs);
	var i, j, count, cont;

	if (Ext.isArray(types)) {
	    busses = types;
	} else if (Ext.isDefined(types)) {
	    busses = [ types ];
	}

	// check if we only have valid busses
	for (i = 0; i < busses.length; i++) {
	    if (!PVE.Utils.diskControllerMaxIDs[busses[i]]) {
		throw "invalid bus: '" + busses[i] + "'";
	    }
	}

	for (i = 0; i < busses.length; i++) {
	    count = PVE.Utils.diskControllerMaxIDs[busses[i]];
	    for (j = 0; j < count; j++) {
		cont = func(busses[i], j);
		if (!cont && cont !== undefined) {
		    return;
		}
	    }
	}
    },

    mp_counts: { mps: 256, unused: 256 },

    forEachMP: function(func, includeUnused) {
	var i, cont;
	for (i = 0; i < PVE.Utils.mp_counts.mps; i++) {
	    cont = func('mp', i);
	    if (!cont && cont !== undefined) {
		return;
	    }
	}

	if (!includeUnused) {
	    return;
	}

	for (i = 0; i < PVE.Utils.mp_counts.unused; i++) {
	    cont = func('unused', i);
	    if (!cont && cont !== undefined) {
		return;
	    }
	}
    },

    hardware_counts: { net: 32, usb: 5, hostpci: 16, audio: 1, efidisk: 1, serial: 4, rng: 1 },

    cleanEmptyObjectKeys: function (obj) {
	var propName;
	for (propName in obj) {
	    if (obj.hasOwnProperty(propName)) {
		if (obj[propName] === null || obj[propName] === undefined) {
		    delete obj[propName];
		}
	    }
	}
    },

    acmedomain_count: 5,

    add_domain_to_acme: function(acme, domain) {
	if (acme.domains === undefined) {
	    acme.domains = [domain];
	} else {
	    acme.domains.push(domain);
	    acme.domains = acme.domains.filter((value, index, self) => {
		return self.indexOf(value) === index;
	    });
	}
	return acme;
    },

    remove_domain_from_acme: function(acme, domain) {
	if (acme.domains !== undefined) {
	    acme.domains = acme.domains.filter((value, index, self) => {
		return self.indexOf(value) === index && value !== domain;
	    });
	}
	return acme;
    },

    handleStoreErrorOrMask: function(me, store, regex, callback) {

	me.mon(store, 'load', function (proxy, response, success, operation) {

	    if (success) {
		Proxmox.Utils.setErrorMask(me, false);
		return;
	    }
	    var msg;

	    if (operation.error.statusText) {
		if (operation.error.statusText.match(regex)) {
		    callback(me, operation.error);
		    return;
		} else {
		    msg = operation.error.statusText + ' (' + operation.error.status + ')';
		}
	    } else {
		msg = gettext('Connection error');
	    }
	    Proxmox.Utils.setErrorMask(me, msg);
	});
    },

    showCephInstallOrMask: function(container, msg, nodename, callback){
	var regex = new RegExp("not (installed|initialized)", "i");
	if (msg.match(regex)) {
	    if (Proxmox.UserName === 'root@pam') {
		container.el.mask();
		if (!container.down('pveCephInstallWindow')){
		    var isInstalled = msg.match(/not initialized/i) ? true : false;
		    var win = Ext.create('PVE.ceph.Install', {
			nodename: nodename
		    });
		    win.getViewModel().set('isInstalled', isInstalled);
		    container.add(win);
		    win.show();
		    callback(win);
		}
	    } else {
		container.mask(Ext.String.format(gettext('{0} not installed.') +
		    ' ' + gettext('Log in as root to install.'), 'Ceph'), ['pve-static-mask']);
	    }
	    return true;
	} else {
	    return false;
	}
    },

    propertyStringSet: function(target, source, name, value) {
	if (source) {
	    if (value === undefined) {
		target[name] = source;
	    } else {
		target[name] = value;
	    }
	} else {
	    delete target[name];
	}
    },

    updateColumns: function(container) {
	let mode = Ext.state.Manager.get('summarycolumns') || 'auto';
	let factor;
	if (mode !== 'auto') {
	    factor = parseInt(mode, 10);
	    if (Number.isNaN(factor)) {
		factor = 1;
	    }
	} else {
	    factor = container.getSize().width < 1400 ? 1 : 2;
	}

	if (container.oldFactor === factor) {
	    return;
	}

	let items = container.query('>'); // direct childs
	factor = Math.min(factor, items.length);
	container.oldFactor = factor;

	items.forEach((item) => {
	    item.columnWidth = 1 / factor;
	});

	// we have to update the layout twice, since the first layout change
	// can trigger the scrollbar which reduces the amount of space left
	container.updateLayout();
	container.updateLayout();
    },

    forEachCorosyncLink: function(nodeinfo, cb) {
	let re = /(?:ring|link)(\d+)_addr/;
	Ext.iterate(nodeinfo, (prop, val) => {
	    let match = re.exec(prop);
	    if (match) {
		cb(Number(match[1]), val);
	    }
	});
    },

    cpu_vendor_map: {
	'default': 'QEMU',
	'AuthenticAMD': 'AMD',
	'GenuineIntel': 'Intel'
    },

    cpu_vendor_order: {
	"AMD": 1,
	"Intel": 2,
	"QEMU": 3,
	"Host": 4,
	"_default_": 5, // includes custom models
    },
},

    singleton: true,
    constructor: function() {
	var me = this;
	Ext.apply(me, me.utilities);
    }

});
