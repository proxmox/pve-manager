Ext.define('PVE.storage.Ceph.Model', {
    extend: 'Ext.app.ViewModel',
    alias: 'viewmodel.cephstorage',

    data: {
	pveceph: true,
	pvecephPossible: true,
    },
});

Ext.define('PVE.storage.Ceph.Controller', {
    extend: 'PVE.controller.StorageEdit',
    alias: 'controller.cephstorage',

    control: {
	'#': {
	    afterrender: 'queryMonitors',
	},
	'textfield[name=username]': {
	    disable: 'resetField',
	},
	'displayfield[name=monhost]': {
	    enable: 'queryMonitors',
	},
	'textfield[name=monhost]': {
	    disable: 'resetField',
	    enable: 'resetField',
	},
    },
    resetField: function(field) {
	field.reset();
    },
    queryMonitors: function(field, newVal, oldVal) {
	// we get called with two signatures, the above one for a field
	// change event and the afterrender from the view, this check only
	// can be true for the field change one and omit the API request if
	// pveceph got unchecked - as it's not needed there.
	if (field && !newVal && oldVal) {
	    return;
	}
	var view = this.getView();
	var vm = this.getViewModel();
	if (!(view.isCreate || vm.get('pveceph'))) {
	    return; // only query on create or if editing a pveceph store
	}

	var monhostField = this.lookupReference('monhost');

	Proxmox.Utils.API2Request({
	    url: '/api2/json/nodes/localhost/ceph/mon',
	    method: 'GET',
	    scope: this,
	    callback: function(options, success, response) {
		var data = response.result.data;
		if (response.status === 200) {
		    if (data.length > 0) {
			var monhost = Ext.Array.pluck(data, 'name').sort().join(',');
			monhostField.setValue(monhost);
			monhostField.resetOriginalValue();
			if (view.isCreate) {
			    vm.set('pvecephPossible', true);
			}
		    } else {
			vm.set('pveceph', false);
		    }
		} else {
		    vm.set('pveceph', false);
		    vm.set('pvecephPossible', false);
		}
	    },
	});
    },
});

Ext.define('PVE.storage.RBDInputPanel', {
    extend: 'PVE.panel.StorageBase',
    controller: 'cephstorage',

    onlineHelp: 'ceph_rados_block_devices',

    viewModel: {
	type: 'cephstorage',
    },

    setValues: function(values) {
	if (values.monhost) {
	    this.viewModel.set('pveceph', false);
	    this.lookupReference('pvecephRef').setValue(false);
	    this.lookupReference('pvecephRef').resetOriginalValue();
	}
	this.callParent([values]);
    },

    initComponent: function() {
	var me = this;

	if (!me.nodename) {
	    me.nodename = 'localhost';
	}
	me.type = 'rbd';

	me.column1 = [];

	if (me.isCreate) {
	    me.column1.push({
		xtype: 'pveCephPoolSelector',
		nodename: me.nodename,
		name: 'pool',
		bind: {
		    disabled: '{!pveceph}',
		    submitValue: '{pveceph}',
		    hidden: '{!pveceph}',
		},
		fieldLabel: gettext('Pool'),
		allowBlank: false,
	    }, {
		xtype: 'textfield',
		name: 'pool',
		value: 'rbd',
		bind: {
		    disabled: '{pveceph}',
		    submitValue: '{!pveceph}',
		    hidden: '{pveceph}',
		},
		fieldLabel: gettext('Pool'),
		allowBlank: false,
	    });
	} else {
	    me.column1.push({
		xtype: 'displayfield',
		nodename: me.nodename,
		name: 'pool',
		fieldLabel: gettext('Pool'),
		allowBlank: false,
	    });
	}

	me.column1.push(
	    {
		xtype: 'textfield',
		name: 'monhost',
		vtype: 'HostList',
		bind: {
		    disabled: '{pveceph}',
		    submitValue: '{!pveceph}',
		    hidden: '{pveceph}',
		},
		value: '',
		fieldLabel: 'Monitor(s)',
		allowBlank: false,
	    },
	    {
		xtype: 'displayfield',
		reference: 'monhost',
		bind: {
		    disabled: '{!pveceph}',
		    hidden: '{!pveceph}',
		},
		value: '',
		fieldLabel: 'Monitor(s)',
	    },
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'username',
		bind: {
		    disabled: '{pveceph}',
		    submitValue: '{!pveceph}',
		},
		value: 'admin',
		fieldLabel: gettext('User name'),
		allowBlank: true,
	    },
	);

	me.column2 = [
	    {
		xtype: 'pveContentTypeSelector',
		cts: ['images', 'rootdir'],
		fieldLabel: gettext('Content'),
		name: 'content',
		value: ['images'],
		multiSelect: true,
		allowBlank: false,
	    },
	    {
		xtype: 'proxmoxcheckbox',
		name: 'krbd',
		uncheckedValue: 0,
		fieldLabel: 'KRBD',
	    },
	];

	me.columnB = [{
	    xtype: 'proxmoxcheckbox',
	    name: 'pveceph',
	    reference: 'pvecephRef',
	    bind: {
		disabled: '{!pvecephPossible}',
		value: '{pveceph}',
	    },
	    checked: true,
	    uncheckedValue: 0,
	    submitValue: false,
	    hidden: !me.isCreate,
	    boxLabel: gettext('Use Proxmox VE managed hyper-converged ceph pool'),
	}];

	me.callParent();
    },
});
