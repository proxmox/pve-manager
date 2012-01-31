/*jslint confusion: true */
Ext.define('PVE.openvz.CreateWizard', {
    extend: 'PVE.window.Wizard',

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

	var storagesel = Ext.create('PVE.form.StorageSelector', {
	    name: 'storage',
	    fieldLabel: 'Storage',
	    storageContent: 'rootdir',
	    autoSelect: true,
	    allowBlank: false
	});

	var tmplsel = Ext.create('PVE.form.FileSelector', {
	    name: 'ostemplate',
	    storageContent: 'vztmpl',
	    fieldLabel: 'OS template',
	    allowBlank: false
	});

	var tmplstoragesel = Ext.create('PVE.form.StorageSelector', {
	    name: 'tmplstorage',
	    fieldLabel: 'Storage',
	    storageContent: 'vztmpl',
	    autoSelect: true,
	    allowBlank: false,
	    listeners: {
		change: function(f, value) {
		    tmplsel.setStorage(value);
		}
	    }
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
	    subject: gettext('OpenVZ Container'),
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
				    tmplstoragesel.setNodename(value);
				    tmplsel.setStorage(undefined, value);
				    bridgesel.setNodename(value);
				    storagesel.setNodename(value);
				}
			    }
			},
			{
			    xtype: 'pveVMIDSelector',
			    name: 'vmid',
			    value: nextvmid,
			    validateExists: false
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
			storagesel,
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
		    column1: [ tmplstoragesel, tmplsel]
		},
		{
		    xtype: 'pveOpenVZResourceInputPanel',
		    title: 'Resources'
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
			if (values.networkmode === 'bridge') {
			    return { netif: 'ifname=eth0,bridge=' + values.bridge };
			} else {
			    return { ip_address: values.ip_address };
			}
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
				    var field = me.down('#dns1');
				    field.setDisabled(!value);
				    field.clearInvalid();
				    field = me.down('#dns2');
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
			    url: '/nodes/' + nodename + '/openvz',
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



