/*jslint confusion: true */
Ext.define('PVE.lxc.CreateWizard', {
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

	var storagesel = Ext.create('PVE.form.StorageSelector', {
	    name: 'storage',
	    fieldLabel: gettext('Storage'),
	    storageContent: 'rootdir',
	    autoSelect: true,
	    allowBlank: false
	});

	var tmplsel = Ext.create('PVE.form.FileSelector', {
	    name: 'ostemplate',
	    storageContent: 'vztmpl',
	    fieldLabel: gettext('Template'),
	    allowBlank: false
	});

	var tmplstoragesel = Ext.create('PVE.form.StorageSelector', {
	    name: 'tmplstorage',
	    fieldLabel: gettext('Storage'),
	    storageContent: 'vztmpl',
	    autoSelect: true,
	    allowBlank: false,
	    listeners: {
		change: function(f, value) {
		    tmplsel.setStorage(value);
		}
	    }
	});

	var networkpanel = Ext.create('PVE.lxc.NetworkInputPanel', {
	    title: gettext('Network'),
	    insideWizard: true,
	    dataCache: {},
	    create: true,
	});

	Ext.applyIf(me, {
	    subject: gettext('LXC Container'),
	    items: [
		{
		    xtype: 'inputpanel',
		    title: gettext('General'),
		    column1: [
			{
			    xtype: 'PVE.form.NodeSelector',
			    name: 'nodename',
			    fieldLabel: gettext('Node'),
			    allowBlank: false,
			    onlineValidator: true,
			    listeners: {
				change: function(f, value) {
				    tmplstoragesel.setNodename(value);
				    tmplsel.setStorage(undefined, value);
				    networkpanel.setNodename(value);
				    storagesel.setNodename(value);
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
			    xtype: 'pvetextfield',
			    name: 'hostname',
			    vtype: 'DnsName',
			    value: '',
			    fieldLabel: gettext('Hostname'),
			    skipEmptyText: true,
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
			},
			{
			    xtype: 'textfield',
			    inputType: 'password',
			    name: 'password',
			    value: '',
			    fieldLabel: gettext('Password'),
			    allowBlank: false,
			    minLength: 5,
			    change: function(f, value) {
				if (!me.rendered) {
				    return;
				}
				me.down('field[name=confirmpw]').validate();
			    }
			},
			{
			    xtype: 'textfield',
			    inputType: 'password',
			    name: 'confirmpw',
			    value: '',
			    fieldLabel: gettext('Confirm password'),
			    allowBlank: false,
			    validator: function(value) {
				var pw = me.down('field[name=password]').getValue();
				if (pw !== value) {
				    return "Passwords does not match!";
				}
				return true;
			    }
			}
		    ],
		    onGetValues: function(values) {
			delete values.confirmpw;
			if (!values.pool) {
			    delete values.pool;
			}
			return values;
		    }
		},
		{
		    xtype: 'inputpanel',
		    title: gettext('Template'),
		    column1: [ tmplstoragesel, tmplsel]
		},
		{
		    xtype: 'inputpanel',
		    title: gettext('Root Disk'),
		    column1: [
			storagesel,
			{
			    xtype: 'numberfield',
			    name: 'rootfs',
			    minValue: 0.1,
			    maxValue: 128*1024,
			    decimalPrecision: 3,
			    value: '8',
			    step: 1,
			    fieldLabel: gettext('Disk size') + ' (GB)',
			    allowBlank: false
			}
		    ]
		},
		{
		    xtype: 'inputpanel',
		    title: gettext('Resources'),
		    items: [
			{
			    xtype: 'pveLxcMemoryInputPanel',
			    title: gettext('Memory'),
			    insideWizard: true
			},
			{
			    xtype: 'pveLxcCPUInputPanel',
			    title: gettext('CPU'),
			    insideWizard: true
			}
		    ]
		},
		networkpanel,
		{
		    xtype: 'pveLxcDNSInputPanel',
		    title: gettext('DNS'),
		    insideWizard: true
		},
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
				if (key === 'delete' || key === 'tmplstorage') { // ignore
				    return;
				}
				if (key === 'password') { // don't show pw
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
			delete kv.tmplstorage;

			PVE.Utils.API2Request({
			    url: '/nodes/' + nodename + '/lxc',
			    waitMsgTarget: me,
			    method: 'POST',
			    params: kv,
			    success: function(response, opts){
				var upid = response.result.data;
		    
				var win = Ext.create('PVE.window.TaskViewer', { 
				    upid: upid
				});
				win.show();
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



