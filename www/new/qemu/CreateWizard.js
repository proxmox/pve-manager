Ext.define('PVE.qemu.CreateWizard', {
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

	var cdfilesel = Ext.create('PVE.form.FileSelector', {
	    name: 'cdimage',
	    storageContent: 'iso',
	    fieldLabel: 'ISO Image',
	    labelAlign: 'right',
	    allowBlank: false
	});

	var cdstoragesel = Ext.create('PVE.form.StorageSelector', {
	    name: 'cdstorage',
	    fieldLabel: 'Storage',
	    storageContent: 'iso',
	    labelAlign: 'right',
	    allowBlank: false,
	    listeners: {
		change: function(f, value) {
		    cdfilesel.setStorage(value);
		}
	    }
	});

	var hdstoragesel = Ext.create('PVE.form.StorageSelector', {
	    name: 'hdstorage',
	    fieldLabel: 'Storage',
	    labelAlign: 'right',
	    storageContent: 'images',
	    allowBlank: false
	});

	Ext.applyIf(me, {
	    title: 'Create new virtual machine',
	    items: [
		{
		    xtype: 'inputpanel',
		    title: 'General',
		    items: [
			{
			    xtype: 'PVE.form.NodeSelector',
			    name: 'nodename',
			    fieldLabel: 'Node',
			    allowBlank: false,
			    listeners: {
				change: function(f, value) {
				    hdstoragesel.setNodename(value);
				    cdstoragesel.setNodename(value);
				    cdfilesel.setStorage(undefined, value);
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
				if (!PVE.data.ResourceStore.findVMID(value))
				    return true;
				return "This VM ID is already in use."
			    }
			},
			{
			    xtype: 'textfield',
			    name: 'name',
			    fieldLabel: 'VM name',
			    allowBlank: true
			}
		    ],
		    onGetValues: function(values) {
			if (!values.name)
			    delete values.name;
			return values;
		    }
		},
		{
		    title: 'OS Type',
		    layout: 'fit',
		    items: {
			xtype: 'radiogroup',
			allowBlank: false,
			layout: 'column',
			defaultType: 'container',
			items: [{
			    columnWidth: .5,
			    items: [
				{
				    xtype: 'component', 
				    html: 'Microsoft Windows', 
				    cls:'x-form-check-group-label'
				},
				{
				    xtype: 'radiofield',
				    name: 'ostype',
				    inputValue: 'win7',
				    boxLabel: 'Microsoft Windows 7/2008r2'
				},
				{
				    xtype: 'radiofield',
				    name: 'ostype',
				    inputValue: 'w2k8',
				    boxLabel: 'Microsoft Windows Vista/2008'
				},
				{
				    xtype: 'radiofield',
				    name: 'ostype',
				    inputValue: 'wxp',
				    boxLabel: 'Microsoft Windows XP/2003'
				},
				{
				    xtype: 'radiofield',
				    name: 'ostype',
				    inputValue: 'w2k',
				    boxLabel: 'Microsoft Windows 2000'
				}
			    ]
			},{
			    columnWidth: .5,
			    items: [
				{
				    xtype: 'component', 
				    html: 'Linux/Other', 
				    cls:'x-form-check-group-label'
				},
				{
				    xtype: 'radiofield',
				    name: 'ostype',
				    inputValue: 'l26',
				    boxLabel: 'Linux 2.6 Kernel'
				},
				{
				    xtype: 'radiofield',
				    name: 'ostype',
				    inputValue: 'l24',
				    boxLabel: 'Linux 2.4 Kernel'
				},
				{
				    xtype: 'radiofield',
				    name: 'ostype',
				    inputValue: 'other',
				    boxLabel: 'Other'
				}
			    ]
			}]
		    }
		},
		{
		    xtype: 'inputpanel',
		    title: 'Installation Media',
		    items: [
			{
			    xtype: 'radiofield',
			    name: 'mediaType',
			    inputValue: 'iso',
			    boxLabel: 'Use CD/DVD disc image file (iso)',
			    checked: true,
			    listeners: {
				change: function(f, value) {
				    me.down('field[name=cdstorage]').setDisabled(!value);
				    me.down('field[name=cdimage]').setDisabled(!value);
				}
			    }
			},
			cdstoragesel, 
			cdfilesel,
			{
			    xtype: 'radiofield',
			    name: 'mediaType',
			    inputValue: 'cdrom',
			    boxLabel: 'Use physical CD/DVD Drive'
			},
			{
			    xtype: 'radiofield',
			    name: 'mediaType',
			    inputValue: 'none',
			    boxLabel: 'Do not use any installation media'
			}
		    ],
		    onGetValues: function(values) {
			if (values.mediaType === 'iso')
			    return { cdrom: values.cdimage };
			if (values.mediaType === 'cdrom')
			    return { cdrom: 'cdrom' };
			return { cdrom: 'none' };
		    }
		},
		{
		    xtype: 'inputpanel',
		    title: 'Harddisk',
		    items: [
			{
			    xtype: 'radiofield',
			    name: 'hdType',
			    inputValue: 'image',
			    boxLabel: 'Create new disk image',
			    checked: true,
			    listeners: {
				change: function(f, value) {
				    me.down('field[name=hdstorage]').setDisabled(!value);
				    me.down('field[name=disksize]').setDisabled(!value);
				    me.down('field[name=controller]').setDisabled(!value);
				    me.down('field[name=diskformat]').setDisabled(!value);
				}
			    }
			},
			hdstoragesel,
			{
			    xtype: 'numberfield',
			    name: 'disksize',
			    labelAlign: 'right',
			    minValue: 1,
			    maxValue: 128*1024,
			    value: 32,
			    fieldLabel: 'Disk size (GB)',
			    allowBlank: false
			},
			{
			    xtype: 'PVE.form.BusTypeSelector',
			    name: 'controller',
			    labelAlign: 'right',
			    fieldLabel: 'Controller',
			    value: 'ide',
			    allowBlank: false
			},
			{
			    xtype: 'PVE.form.DiskFormatSelector',
			    name: 'diskformat',
			    labelAlign: 'right',
			    fieldLabel: 'Image format',
			    value: 'raw',
			    allowBlank: false
			},
			{
			    xtype: 'radiofield',
			    name: 'hdType',
			    inputValue: 'none',
			    boxLabel: 'Do not attach a hard disk'
			}
		    ],
		    onGetValues: function(values) {
			if (values.hdType === 'none')
			    return {};

			var str = values.hdstorage + ':' + values.disksize +
			    ',format=' + values.diskformat;
			var busid = 0;
			var key = values.controller + "" + busid;
			var res = {};
			res[key] = str;
			return res;
		    }
		},	
		{
		    title: 'CPU',
		    items: [
			{
			    xtype: 'numberfield',
			    name: 'sockets',
			    minValue: 1,
			    maxValue: 4,
			    value: 1,
			    fieldLabel: 'Sockets',
			    allowBlank: false,
			    listeners: {
				change: function(f, value) {
				    var sockets = me.down('field[name=sockets]').getValue();
				    var cores = me.down('field[name=cores]').getValue();
				    me.down('field[name=totalcores]').setValue(sockets*cores);
				}
			    }
			},
			{
			    xtype: 'numberfield',
			    name: 'cores',
			    minValue: 1,
			    maxValue: 32,
			    value: 1,
			    fieldLabel: 'Cores',
			    allowBlank: false,
			    listeners: {
				change: function(f, value) {
				    var sockets = me.down('field[name=sockets]').getValue();
				    var cores = me.down('field[name=cores]').getValue();
				    me.down('field[name=totalcores]').setValue(sockets*cores);
				}
			    }
			},
			{
			    xtype: 'displayfield',
			    fieldLabel: 'Total cores',
			    name: 'totalcores',
			    value: 1
			}
		    ]
		},
		{
		    title: 'Memory',
		    items: [
			{
			    xtype: 'numberfield',
			    name: 'memory',
			    minValue: 32,
			    maxValue: 128*1024,
			    value: 512,
			    step: 32,
			    fieldLabel: 'Memory (MB)',
			    allowBlank: false
			}
		    ]
		},
		{
		    xtype: 'inputpanel',
		    title: 'Network',
		    items: [
			{
			    xtype: 'textfield',
			    name: 'bridge',
			    value: 'vmbr0',
			    fieldLabel: 'Bridge',
			    allowBlank: false
			},
			{
			    xtype: 'PVE.form.NetworkCardSelector',
			    name: 'netcard',
			    fieldLabel: 'Network card',
			    value: 'rtl8139',
			    allowBlank: false
			},
			{
			    xtype: 'textfield',
			    name: 'mac',
			    fieldLabel: 'MAC address',
			    allowBlank: true,
			    emptyText: 'auto'
			}
		    ],
		    onGetValues: function(values) {
			var str = values.netcard;
			if (values.mac)
			    str += '=' + values.mac;
			str += ',bridge=' + values.bridge;

			return { net0: str };
		    }
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
				var html = Ext.htmlEncode(Ext.JSON.encode(value));
				data.push({ key: key, value: value });
			    });
			    summarystore.removeAll();
			    summarystore.add(data);
			    summarystore.sort();
			}
		    },
		    onSubmit: function() {
			var kv = me.getValues();

			var nodename = kv.nodename;
			delete kv.nodename;

			me.down('form').setLoading(true, true);
			PVE.Utils.API2Request({
			    url: '/nodes/' + nodename + '/qemu',
			    method: 'POST',
			    params: kv,
			    callback: function() {
				me.down('form').setLoading(false);
			    },
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




