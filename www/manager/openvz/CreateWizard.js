Ext.define('PVE.openvz.CreateWizard', {
    extend: 'PVE.window.Wizard',
    requires: [    
	'Ext.form.*',
	'PVE.data.ResourceStore'
    ],

    initComponent: function() {
	var me = this;

	var nextvmid = PVE.data.ResourceStore.findNextVMID();

	var summarystore = Ext.create('Ext.data.Store', {
	    model: 'KeyValue',
	    sorters: [
		{
		    property : 'key',
		    direction: 'ASC'
		}
	    ]
	});

	var tmplsel = Ext.create('PVE.form.FileSelector', {
	    name: 'ostemplate',
	    storageContent: 'vztmpl',
	    fieldLabel: 'OS template',
	    allowBlank: false
	});

	var bridgesel = Ext.create('PVE.form.BridgeSelector', {
	    name: 'bridge',
	    fieldLabel: 'Bridge',
	    labelAlign: 'right',
	    autoSelect: true,
	    disabled: true,
	    allowBlank: false
	});

	Ext.applyIf(me, {
	    title: 'Create new container',
	    items: [
		{
		    xtype: 'inputpanel',
		    title: 'General',
		    column1: [
			{
			    xtype: 'PVE.form.NodeSelector',
			    name: 'nodename',
			    fieldLabel: 'Node',
			    allowBlank: false,
			    onlineValidator: true,
			    listeners: {
				change: function(f, value) {
				    tmplsel.setStorage('local', value);
				    bridgesel.setNodename(value);
				}
			    }
			},
			{
			    xtype: 'numberfield',
			    name: 'vmid',
			    value: nextvmid,
			    minValue: 100,
			    maxValue: 999999999,
			    fieldLabel: 'VM ID',
			    allowBlank: false,
			    validator: function(value) {
				/*jslint confusion: true */
				if (!PVE.data.ResourceStore.findVMID(value)) {
				    return true;
				}
				return "This VM ID is already in use.";
			    }
			},
			{
			    xtype: 'pvetextfield',
			    name: 'hostname',
			    value: '',
			    fieldLabel: 'Hostname',
			    skipEmptyText: true,
			    allowBlank: true
			}
		    ],
		    column2: [
			{
			    xtype: 'textfield',
			    inputType: 'password',
			    name: 'password',
			    value: '',
			    fieldLabel: 'Password',
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
			    fieldLabel: 'Confirm password',
			    allowBlank: false,
			    validator: function(value) {
				var pw = me.down('field[name=password]').getValue();
				if (pw !== value) {
				    return "Passowords does not match!";
				}
				return true;
			    }
			}
		    ],
		    onGetValues: function(values) {
			delete values.confirmpw;
			return values;
		    }
		},
		{
		    xtype: 'inputpanel',
		    title: 'Template',
		    items: tmplsel
		},
		{
		    xtype: 'inputpanel',
		    title: 'Resources',
		    column1: [
			{
			    xtype: 'numberfield',
			    name: 'memory',
			    minValue: 32,
			    maxValue: 128*1024,
			    value: '512',
			    step: 32,
			    fieldLabel: 'Memory (MB)',
			    allowBlank: false
			},
			{
			    xtype: 'numberfield',
			    name: 'swap',
			    minValue: 0,
			    maxValue: 128*1024,
			    value: '512',
			    step: 32,
			    fieldLabel: 'Swap (MB)',
			    allowBlank: false
			}
		    ],
		    column2: [
			{
			    xtype: 'numberfield',
			    name: 'disk',
			    minValue: 0.5,
			    value: '4',
			    step: 1,
			    fieldLabel: 'Disk space (GB)',
			    allowBlank: false
			},
			{
			    xtype: 'numberfield',
			    name: 'cpus',
			    minValue: 1,
			    value: '1',
			    step: 1,
			    fieldLabel: 'CPUs',
			    allowBlank: false
			}
		    ]
		},
		{
		    xtype: 'inputpanel',
		    title: 'Network',
		    column1: [
			{
			    xtype: 'radiofield',
			    name: 'networkmode',
			    inputValue: 'routed',
			    boxLabel: 'Routed mode (venet)',
			    checked: true,
			    listeners: {
				change: function(f, value) {
				    if (!me.rendered) {
					return;
				    }
				    me.down('field[name=ip_address]').setDisabled(!value);
				    me.down('field[name=ip_address]').validate();
				}
			    }
			},
			{
			    xtype: 'textfield',
			    name: 'ip_address',
			    vtype: 'IPAddress',
			    value: '',
			    fieldLabel: 'IP address',
			    labelAlign: 'right',
			    allowBlank: false
			}
		    ],
		    column2: [
			{
			    xtype: 'radiofield',
			    name: 'networkmode',
			    inputValue: 'bridge',
			    boxLabel: 'Bridged mode',
			    checked: false,
			    listeners: {
				change: function(f, value) {
				    if (!me.rendered) {
					return;
				    }
				    me.down('field[name=bridge]').setDisabled(!value);
				    me.down('field[name=bridge]').validate();
				}
			    }
			},
			bridgesel
		    ],
		    onGetValues: function(values) {
			delete values.networkmode;
			return values;
		    }
		},
		{
		    xtype: 'inputpanel',
		    title: 'DNS',
		    column1: [
			{
			    xtype: 'pvetextfield',
			    name: 'searchdomain',
			    skipEmptyText: true,
			    fieldLabel: 'DNS domain',
			    emptyText: 'use host settings',
			    allowBlank: true,
			    listeners: {
				change: function(f, value) {
				    if (!me.rendered) {
					return;
				    }
				    var field =  me.down('#dns1');
				    field.setDisabled(!value);
				    field.clearInvalid();
				    var field =  me.down('#dns2');
				    field.setDisabled(!value);
				    field.clearInvalid();
				}
			    }
			},
			{
			    xtype: 'pvetextfield',
			    fieldLabel: 'DNS server 1',
			    vtype: 'IPAddress',
			    allowBlank: true,
			    disabled: true,
			    name: 'nameserver',
			    itemId: 'dns1'
			},
			{
			    xtype: 'pvetextfield',
			    fieldLabel: 'DNS server 2',
			    vtype: 'IPAddress',
			    skipEmptyText: true,
			    disabled: true,
			    name: 'nameserver',
			    itemId: 'dns2'
			}
		    ]
		},
		{
		    title: 'Confirm',
		    layout: 'fit',
		    items: [
			{
			    title: 'Settings',
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

			PVE.Utils.API2Request({
			    url: '/nodes/' + nodename + '/openvz',
			    waitMsgTarget: me,
			    method: 'POST',
			    params: kv,
			    success: function(response){
				me.close();
			    },
			    failure: function(response, opts) {
				Ext.Msg.alert('Error', response.htmlStatus);
			    }
			});
		    }
		}
	    ]
	});

	me.callParent();
    }
});



