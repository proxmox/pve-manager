/*jslint confusion: true*/
Ext.define('PVE.ClusterCreateWindow', {
    extend: 'Proxmox.window.Edit',
    xtype: 'pveClusterCreateWindow',

    title: gettext('Create Cluster'),
    width: 600,

    method: 'POST',
    url: '/cluster/config',

    isCreate: true,
    subject: gettext('Cluster'),
    showTaskViewer: true,

    items: [
	{
	    xtype: 'textfield',
	    fieldLabel: gettext('Cluster Name'),
	    allowBlank: false,
	    name: 'clustername'
	},
	{
	    xtype: 'proxmoxtextfield',
	    fieldLabel: gettext('Ring 0 Address'),
	    emptyText: gettext("Optional, defaults to IP resolved by node's hostname"),
	    name: 'ring0_addr',
	    skipEmptyText: true
	}
	// TODO: for advanced options: ring1_addr
    ]
});

Ext.define('PVE.ClusterInfoWindow', {
    extend: 'Ext.window.Window',
    xtype: 'pveClusterInfoWindow',
    mixins: ['Proxmox.Mixin.CBind'],

    width: 800,
    modal: true,
    resizable: false,
    title: gettext('Cluster Join Information'),

    joinInfo: {
	ipAddress: undefined,
	fingerprint: undefined,
	totem: {}
    },

    items: [
	{
	    xtype: 'component',
	    border: false,
	    padding: '10 10 10 10',
	    html: gettext("Copy the Join Information here and use it on the node you want to add.")
	},
	{
	    xtype: 'container',
	    layout: 'form',
	    border: false,
	    padding: '0 10 10 10',
	    items: [
		{
		    xtype: 'textfield',
		    fieldLabel: gettext('IP Address'),
		    cbind: { value: '{joinInfo.ipAddress}' },
		    editable: false
		},
		{
		    xtype: 'textfield',
		    fieldLabel: gettext('Fingerprint'),
		    cbind: { value: '{joinInfo.fingerprint}' },
		    editable: false
		},
		{
		    xtype: 'textarea',
		    inputId: 'pveSerializedClusterInfo',
		    fieldLabel: gettext('Join Information'),
		    grow: true,
		    cbind: { joinInfo: '{joinInfo}' },
		    editable: false,
		    listeners: {
			afterrender: function(field) {
			    if (!field.joinInfo) {
				return;
			    }
			    var jsons = Ext.JSON.encode(field.joinInfo);
			    var base64s = Ext.util.Base64.encode(jsons);
			    field.setValue(base64s);
			}
		    }
		}
	    ]
	}
    ],
    dockedItems: [{
	dock: 'bottom',
	xtype: 'toolbar',
	items: [{
	    xtype: 'button',
	    handler: function(b) {
		var el = document.getElementById('pveSerializedClusterInfo');
		el.select();
		document.execCommand("copy");
	    },
	    text: gettext('Copy Information')
	}]
    }]
});

Ext.define('PVE.ClusterJoinNodeWindow', {
    extend: 'Proxmox.window.Edit',
    xtype: 'pveClusterJoinNodeWindow',

    title: gettext('Cluster Join'),
    width: 800,

    method: 'POST',
    url: '/cluster/config/join',

    defaultFocus: 'textarea[name=serializedinfo]',
    isCreate: true,
    submitText: gettext('Join'),
    showTaskViewer: true,

    onlineHelp: 'chapter_pvecm',

    viewModel: {
	parent: null,
	data: {
	    info: {
		fp: '',
		ip: '',
		ring1Possible: false,
		ring1Needed: false
	    }
	}
    },

    controller: {
	xclass: 'Ext.app.ViewController',
	control: {
	    '#': {
		close: function() {
		    delete PVE.Utils.silenceAuthFailures;
		}
	    },
	    'proxmoxcheckbox[name=assistedEntry]': {
		change: 'onInputTypeChange'
	    },
	    'textarea[name=serializedinfo]': {
		change: 'recomputeSerializedInfo',
		enable: 'resetField'
	    },
	    'proxmoxtextfield[name=ring1_addr]': {
		enable: 'ring1Needed'
	    },
	    'textfield': {
		disable: 'resetField'
	    }
	},
	resetField: function(field) {
	    field.reset();
	},
	ring1Needed: function(f) {
	    var vm = this.getViewModel();
	    f.allowBlank = !vm.get('info.ring1Needed');
	},
	onInputTypeChange: function(field, assistedInput) {
	    var vm = this.getViewModel();
	    if (!assistedInput) {
		vm.set('info.ring1Possible', true);
	    }
	},
	recomputeSerializedInfo: function(field, value) {
	    var vm = this.getViewModel();
	    var jsons = Ext.util.Base64.decode(value);
	    var joinInfo = Ext.JSON.decode(jsons, true);

	    var info = {
		fp: '',
		ring1Needed: false,
		ring1Possible: false,
		ip: ''
	    };

	    var totem = {};
	    if (!(joinInfo && joinInfo.totem)) {
		field.valid = false;
	    } else {
		info = {
		    ip: joinInfo.ipAddress,
		    fp: joinInfo.fingerprint,
		    ring1Possible: !!joinInfo.totem['interface']['1'],
		    ring1Needed: !!joinInfo.totem['interface']['1']
		};
		totem = joinInfo.totem;
		field.valid = true;
	    }

	    vm.set('info', info);
	}
    },

    submit: function() {
	// joining may produce temporarily auth failures, ignore as long the task runs
	PVE.Utils.silenceAuthFailures = true;
	this.callParent();
    },

    taskDone: function(success) {
	delete PVE.Utils.silenceAuthFailures;
	if (success) {
	    var txt = gettext('Cluster join task finished, node certificate may have changed, reload GUI!');
	    // ensure user cannot do harm
	    Ext.getBody().mask(txt, ['pve-static-mask']);
	    // TaskView may hide above mask, so tell him directly
	    Ext.Msg.show({
		title: gettext('Join Task Finished'),
		icon: Ext.Msg.INFO,
		msg: txt
	    });
	    // reload always (if user wasn't faster), but wait a bit for pveproxy
	    Ext.defer(function() {
		window.location.reload(true);
	    }, 5000);
	}
    },

    items: [{
	xtype: 'proxmoxcheckbox',
	reference: 'assistedEntry',
	name: 'assistedEntry',
	submitValue: false,
	value: true,
	autoEl: {
	    tag: 'div',
	    'data-qtip': gettext('Select if join information should be extracted from pasted cluster information, deselect for manual entering')
	},
	boxLabel: gettext('Assisted join: Paste encoded cluster join information and enter password.')
    },
    {
	xtype: 'textarea',
	name: 'serializedinfo',
	submitValue: false,
	allowBlank: false,
	fieldLabel: gettext('Information'),
	emptyText: gettext('Paste encoded Cluster Information here'),
	validator: function(val) {
	    return val === '' || this.valid ||
	       gettext('Does not seem like a valid encoded Cluster Information!');
	},
	bind: {
	    disabled: '{!assistedEntry.checked}',
	    hidden: '{!assistedEntry.checked}'
	},
	value: ''
    },
    {
	xtype: 'inputpanel',
	column1: [
	    {
		xtype: 'textfield',
		fieldLabel: gettext('Peer Address'),
		allowBlank: false,
		bind: {
		    value: '{info.ip}',
		    readOnly: '{assistedEntry.checked}'
		},
		name: 'hostname'
	    },
	    {
		xtype: 'textfield',
		inputType: 'password',
		emptyText: gettext("Peer's root password"),
		fieldLabel: gettext('Password'),
		allowBlank: false,
		name: 'password'
	    }
	],
	column2: [
	    {
		xtype: 'proxmoxtextfield',
		fieldLabel: gettext('Corosync Ring 0'),
		emptyText: gettext("Default: IP resolved by node's hostname"),
		skipEmptyText: true,
		name: 'ring0_addr'
	    },
	    {
		xtype: 'proxmoxtextfield',
		fieldLabel: gettext('Corosync Ring 1'),
		skipEmptyText: true,
		bind: {
		    disabled: '{!info.ring1Possible}'
		},
		name: 'ring1_addr'
	    }
	],
	columnB: [
	    {
		xtype: 'textfield',
		fieldLabel: gettext('Fingerprint'),
		allowBlank: false,
		bind: {
		    value: '{info.fp}',
		    readOnly: '{assistedEntry.checked}'
		},
		name: 'fingerprint'
	    }
	]
    }]
});
