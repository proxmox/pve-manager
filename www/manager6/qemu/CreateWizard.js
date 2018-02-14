/*jslint confusion: true*/
Ext.define('PVE.qemu.CreateWizard', {
    extend: 'PVE.window.Wizard',
    alias: 'widget.pveQemuCreateWizard',
    mixins: ['Proxmox.Mixin.CBind'],

    viewModel: {
	data: {
	    nodename: ''
	}
    },

    cbindData: {
	nodename: undefined
    },

    subject: gettext('Virtual Machine'),

    items: [
	{
	    xtype: 'inputpanel',
	    title: gettext('General'),
	    onlineHelp: 'qm_general_settings',
	    column1: [
		{
		    xtype: 'pveNodeSelector',
		    name: 'nodename',
		    cbind: {
			selectCurNode: '{!nodename}',
			preferredValue: '{nodename}'
		    },
		    bind: {
			value: '{nodename}'
		    },
		    fieldLabel: gettext('Node'),
		    allowBlank: false,
		    onlineValidator: true
		},
		{
		    xtype: 'pveGuestIDSelector',
		    name: 'vmid',
		    guestType: 'qemu',
		    value: '',
		    loadNextFreeID: true,
		    validateExists: false
		},
		{
		    xtype: 'textfield',
		    name: 'name',
		    vtype: 'DnsName',
		    value: '',
		    fieldLabel: gettext('Name'),
		    allowBlank: true
		}
	    ],
	    column2: [
		{
		    xtype: 'pvePoolSelector',
		    fieldLabel: gettext('Resource Pool'),
		    name: 'pool',
		    value: '',
		    allowBlank: true
		}
	    ],
	    onGetValues: function(values) {
		if (!values.name) {
		    delete values.name;
		}
		if (!values.pool) {
		    delete values.pool;
		}
		return values;
	    }
	},
	{
	    xtype: 'container',
	    layout: 'hbox',
	    defaults: {
		flex: 1,
		padding: '0 10'
	    },
	    title: gettext('OS'),
	    items: [
		{
		    xtype: 'pveQemuCDInputPanel',
		    bind: {
			nodename: '{nodename}'
		    },
		    confid: 'ide2',
		    insideWizard: true
		},
		{
		    xtype: 'pveQemuOSTypePanel',
		    insideWizard: true
		}
	    ]
	},
	{
	    xtype: 'pveQemuHDInputPanel',
	    bind: {
		nodename: '{nodename}'
	    },
	    title: gettext('Hard Disk'),
	    isCreate: true,
	    insideWizard: true
	},
	{
	    xtype: 'pveQemuProcessorPanel',
	    insideWizard: true,
	    title: gettext('CPU')
	},
	{
	    xtype: 'pveQemuMemoryPanel',
	    insideWizard: true,
	    title: gettext('Memory')
	},
	{
	    xtype: 'pveQemuNetworkInputPanel',
	    bind: {
		nodename: '{nodename}'
	    },
	    title: gettext('Network'),
	    insideWizard: true
	},
	{
	    title: gettext('Confirm'),
	    layout: 'fit',
	    items: [
		{
		    xtype: 'grid',
		    store: {
			model: 'KeyValue',
			sorters: [{
			    property : 'key',
			    direction: 'ASC'
			}]
		    },
		    columns: [
			{header: 'Key', width: 150, dataIndex: 'key'},
			{header: 'Value', flex: 1, dataIndex: 'value'}
		    ]
		}
	    ],
	    listeners: {
		show: function(panel) {
		    var kv = this.up('window').getValues();
		    var data = [];
		    Ext.Object.each(kv, function(key, value) {
			if (key === 'delete') { // ignore
			    return;
			}
			data.push({ key: key, value: value });
		    });

		    var summarystore = panel.down('grid').getStore();
		    summarystore.suspendEvents();
		    summarystore.removeAll();
		    summarystore.add(data);
		    summarystore.sort();
		    summarystore.resumeEvents();
		    summarystore.fireEvent('refresh');

		}
	    },
	    onSubmit: function() {
		var wizard = this.up('window');
		var kv = wizard.getValues();
		delete kv['delete'];

		var nodename = kv.nodename;
		delete kv.nodename;

		Proxmox.Utils.API2Request({
		    url: '/nodes/' + nodename + '/qemu',
		    waitMsgTarget: wizard,
		    method: 'POST',
		    params: kv,
		    success: function(response){
			wizard.close();
		    },
		    failure: function(response, opts) {
			Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		    }
		});
	    }
	}
    ]
});




