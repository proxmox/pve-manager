// fixme: howto avoid jslint type confusion?
/*jslint confusion: true */
Ext.define('PVE.qemu.CreateWizard', {
    extend: 'PVE.window.Wizard',

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

	var cdpanel = Ext.create('PVE.qemu.CDInputPanel', {
	    title: 'CD/DVD',
	    confid: 'ide2',
	    fieldDefaults: {
		labelWidth: 160
	    },
	    insideWizard: true
	});

	var hdpanel = Ext.create('PVE.qemu.HDInputPanel', {
	    title: gettext('Hard Disk'),
	    create: true,
	    insideWizard: true
	});

	var networkpanel =  Ext.create('PVE.qemu.NetworkInputPanel', {
	    title: gettext('Network'),
	    insideWizard: true
	});

	Ext.applyIf(me, {
	    subject: gettext('Virtual Machine'),
	    items: [
		{
		    xtype: 'inputpanel',
		    title: gettext('General'),
		    column1: [
			{
			    xtype: 'PVE.form.NodeSelector',
			    name: 'nodename',
			    selectCurNode: true,
			    fieldLabel: gettext('Node'),
			    allowBlank: false,
			    onlineValidator: true,
			    listeners: {
				change: function(f, value) {
				    networkpanel.setNodename(value);
				    hdpanel.setNodename(value);
				    cdpanel.setNodename(value);
				}
			    }
			},
			{
			    xtype: 'pveVMIDSelector',
			    name: 'vmid',
			    value: '',
			    loadNextFreeVMID: true,
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
		    title: 'OS',
		    xtype: 'PVE.qemu.OSTypeInputPanel'
		},
		cdpanel,
		hdpanel,
		{
		    xtype: 'PVE.qemu.ProcessorInputPanel',
		    title: 'CPU'
		},
		{
		    xtype: 'PVE.qemu.MemoryInputPanel',
		    insideWizard: true,
		    title: gettext('Memory')
		},
		networkpanel,
		{
		    title: gettext('Confirm'),
		    layout: 'fit',
		    items: [
			{
			    title: gettext('Settings'),
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
			    var form = me.down('form').getForm();
			    var kv = me.getValues();
			    var data = [];
			    Ext.Object.each(kv, function(key, value) {
				if (key === 'delete') { // ignore
				    return;
				}
				var html = Ext.htmlEncode(Ext.JSON.encode(value));
				data.push({ key: key, value: value });
			    });
			    summarystore.suspendEvents();
			    summarystore.removeAll();
			    summarystore.add(data);
			    summarystore.sort();
			    summarystore.resumeEvents();
			    summarystore.fireEvent('datachanged', summarystore);

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




