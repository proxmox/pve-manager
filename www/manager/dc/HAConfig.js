/*jslint confusion: true */
Ext.define('PVE.dc.vmHAServiceEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;

	me.create = me.vmid ? false : true;

	if (me.vmid) {
	    me.create = false;
	    me.url = "/cluster/ha/groups/pvevm:" + me.vmid;
	    me.method = 'PUT';
	} else {
	    me.create = true;
	    me.url = "/cluster/ha/groups";
	    me.method = 'POST';
	}

	Ext.apply(me, {
	    subject: gettext('HA managed VM/CT'),
	    width: 350,
	    items: [
		{
		    xtype: me.create ? 'pveVMIDSelector' : 'displayfield',
		    name: 'vmid',
		    validateExists: true,
		    value:  me.vmid || '',
		    fieldLabel: "VM ID"
		},
		{
		    xtype: 'pvecheckbox',
		    name: 'autostart',
		    checked: true,
		    fieldLabel: 'autostart'
		}
	    ]
	});

	me.callParent();

	if (!me.create) {
	    me.load();
	}
    }
});

Ext.define('PVE.dc.HAConfig', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveDcHAConfig',

    clusterInfo: {}, // reload store data here

    reload: function() {
        var me = this;

	var getClusterInfo = function(conf) {

	    var info = {};

	    if (!(conf && conf.children && conf.children[0])) {
		return info;
	    }

	    var cluster = conf.children[0];

	    if (cluster.text !== 'cluster' || !cluster.config_version) {
		return info;
	    }

	    info.version = cluster.config_version;

	    Ext.Array.each(cluster.children, function(item) {
		if (item.text === 'fencedevices') {
		    // fixme: make sure each node uses at least one fence device
		    info.fenceDevices = true;
		} else if (item.text === 'rm') {
		    info.ha = true;
		}
	    });

	    return info;
	};

	PVE.Utils.API2Request({
	    url: '/cluster/ha/config',
	    waitMsgTarget: me,
	    method: 'GET',
	    failure: function(response, opts) {
		me.clusterInfo = {};
		PVE.Utils.setErrorMask(me, response.htmlStatus);
	    },
	    success: function(response, opts) {
		me.clusterInfo = getClusterInfo(response.result.data);

		me.setDisabled(!me.clusterInfo.version);

		me.addMenu.setDisabled(!me.clusterInfo.version);

		// note: this modifies response.result.data
		me.treePanel.setRootNode(response.result.data);
		me.treePanel.expandAll();


		if (response.result.changes) {
		    me.commitBtn.setDisabled(false);
		    me.revertBtn.setDisabled(false);
		    me.diffPanel.setVisible(true);
		    me.diffPanel.update("<pre>" + Ext.htmlEncode(response.result.changes) + "</pre>");
		} else {
		    me.commitBtn.setDisabled(true);
		    me.revertBtn.setDisabled(true);
		    me.diffPanel.setVisible(false);
		    me.diffPanel.update('');
		}
	    }
	});
    },

    initComponent: function() {
        var me = this;

	me.commitBtn = new PVE.button.Button({
	    text: gettext('Activate'),
	    disabled: true,
	    confirmMsg: function () {
		return gettext('Are you sure you want to activate your changes');
	    },
	    handler: function(btn, event) {
		PVE.Utils.API2Request({
		    url: '/cluster/ha/changes',
		    method: 'POST',
		    waitMsgTarget: me,
		    callback: function() {
			me.reload();
		    },
		    failure: function (response, opts) {
			Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		    }
		});
	    }
	});

	me.revertBtn = new PVE.button.Button({
	    text: gettext('Revert changes'),
	    disabled: true,
	    confirmMsg: function () {
		return gettext('Are you sure you want to revert your changes');
	    },
	    handler: function(btn, event) {
		PVE.Utils.API2Request({
		    url: '/cluster/ha/changes',
		    method: 'DELETE',
		    waitMsgTarget: me,
		    callback: function() {
			me.reload();
		    },
		    failure: function (response, opts) {
			Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		    }
		});
	    }
	});

	me.addMenu = new Ext.button.Button({
	    text: gettext('Add'),
	    disabled: true,	    
	    menu: new Ext.menu.Menu({
		items: [
		    {
			text: gettext('HA managed VM/CT'),
			handler: function() {
			    var win = Ext.create('PVE.dc.vmHAServiceEdit', {});
			    win.show();
			    win.on('destroy', me.reload, me);
			}	    
		    },
		    {
			text: gettext('Failover Domain'),
			handler: function() {
			    Ext.Msg.alert(gettext('Error'), "not implemented - sorry");
			}
		    }
		]
	    })
	});

	me.treePanel = Ext.create('Ext.tree.Panel', {
	    rootVisible: false,
	    animate: false,
	    region: 'center',
	    border: false,
	    fields: ['text', 'id', 'vmid', 'name' ],
	    columns: [
		{
		    xtype: 'treecolumn',
		    text: 'Tag',
		    dataIndex: 'text',
		    width: 200
		},
		{ 
		    text: 'Attributes',
		    dataIndex: 'id',
		    renderer: function(value, metaData, record) {
			var text = '';
			Ext.Object.each(record.raw, function(key, value) {
			    if (key === 'id' || key === 'text') {
				return;
			    }
			    text += Ext.htmlEncode(key) + '="' + 
				Ext.htmlEncode(value) + '" '; 
			});
			return text;
		    }, 
		    flex: 1
		}
	    ]
	});

	var run_editor = function() {
	    var rec = me.treePanel.selModel.getSelection()[0];
	    if (rec && rec.data.text === 'pvevm') {
		var win = Ext.create('PVE.dc.vmHAServiceEdit', {
		    vmid: rec.data.vmid
		});
		win.show();
		win.on('destroy', me.reload, me);
	    }
	};

	me.editBtn = new Ext.button.Button({
	    text: gettext('Edit'),
	    disabled: true,
	    handler: run_editor
	});

	me.removeBtn = new Ext.button.Button({
	    text: gettext('Remove'),
	    disabled: true,
	    handler: function() {
		var rec = me.treePanel.selModel.getSelection()[0];
		if (rec && rec.data.text === 'pvevm') {
		    var groupid = 'pvevm:' + rec.data.vmid;
		    PVE.Utils.API2Request({
			url: '/cluster/ha/groups/' + groupid,
			method: 'DELETE',
			waitMsgTarget: me,
			callback: function() {
			    me.reload();
			},
			failure: function (response, opts) {
			    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
			}
		    });
		}
	    }
	});


	me.diffPanel = Ext.create('Ext.panel.Panel', {
	    border: false,
	    hidden: true,
	    region: 'south',
	    autoScroll: true,
	    itemId: 'changes',
	    tbar: [ gettext('Pending changes') ],
	    split: true, 
	    bodyPadding: 5,
	    flex: 0.6
	});

	Ext.apply(me, {
	    layout: 'border',
	    tbar: [ me.addMenu, me.removeBtn, me.editBtn, me.revertBtn, me.commitBtn ],
	    items: [ me.treePanel, me.diffPanel ]
	});

	me.callParent();

	me.on('show', me.reload);

	me.treePanel.on("selectionchange", function(sm, selected) {
	    var rec = selected[0];
	    if (rec && rec.data.text === 'pvevm') {
		me.editBtn.setDisabled(false);
		me.removeBtn.setDisabled(false);
	    } else {
		me.editBtn.setDisabled(true);
		me.removeBtn.setDisabled(true);

	    }
	});

	me.treePanel.on("itemdblclick", function(v, record) {
	    run_editor();
	});
    }
});
