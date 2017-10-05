Ext.define('PVE.qemu.CreateWizard', {
    extend: 'PVE.window.Wizard',
    alias: 'widget.pveQemuCreateWizard',

    controller: {

	xclass: 'Ext.app.ViewController',

	control: {
	    'field[name=nodename]': {
		change: function(f, value) {
		    var me = this;
		    ['networkpanel', 'hdpanel', 'cdpanel'].forEach(function(reference) {
			me.lookup(reference).setNodename(value);
		    });
		}
	    }
	}
    },

    initComponent: function() {
	var me = this;

	var summarystore = Ext.create('Ext.data.Store', {
	    model: 'KeyValue',
	    sorters: [
		{
		    property : 'key',
		    direction: 'ASC'
		}
	    ]
	});

	Ext.applyIf(me, {
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
			    selectCurNode: !me.nodename,
			    preferredValue: me.nodename,
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
			    reference: 'cdpanel',
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
		    reference: 'hdpanel',
		    title: gettext('Hard Disk'),
		    isCreate: true,
		    insideWizard: true
		},
		{
		    xtype: 'pveQemuProcessorPanel',
		    title: gettext('CPU')
		},
		{
		    xtype: 'pveQemuMemoryPanel',
		    insideWizard: true,
		    title: gettext('Memory')
		},
		{
		    xtype: 'pveQemuNetworkInputPanel',
		    reference: 'networkpanel',
		    title: gettext('Network'),
		    insideWizard: true
		},
		{
		    title: gettext('Confirm'),
		    layout: 'fit',
		    items: [
			{
			    xtype: 'grid',
			    store: summarystore,
			    columns: [
				{header: 'Key', width: 150, dataIndex: 'key'},
				{header: 'Value', flex: 1, dataIndex: 'value'}
			    ]
			}
		    ],
		    listeners: {
			show: function(panel) {
			    var kv = me.getValues();
			    var data = [];
			    Ext.Object.each(kv, function(key, value) {
				if (key === 'delete') { // ignore
				    return;
				}
				data.push({ key: key, value: value });
			    });
			    summarystore.suspendEvents();
			    summarystore.removeAll();
			    summarystore.add(data);
			    summarystore.sort();
			    summarystore.resumeEvents();
			    summarystore.fireEvent('refresh');

			}
		    },
		    onSubmit: function() {
			var kv = me.getValues();
			delete kv['delete'];

			var nodename = kv.nodename;
			delete kv.nodename;

			PVE.Utils.API2Request({
			    url: '/nodes/' + nodename + '/qemu',
			    waitMsgTarget: me,
			    method: 'POST',
			    params: kv,
			    success: function(response){
				me.close();
			    },
			    failure: function(response, opts) {
				Ext.Msg.alert(gettext('Error'), response.htmlStatus);
			    }
			});
		    }
		}
	    ]
	});

	me.callParent();
    }
});




