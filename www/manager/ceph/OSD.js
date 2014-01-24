Ext.define('PVE.CephCreateOsd', {
    extend: 'PVE.window.Edit',
    alias: ['widget.pveCephCreateOsd'],

    subject: 'Ceph OSD',

    showProgress: true,

    initComponent : function() {
	 /*jslint confusion: true */
        var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	me.create = true;
  
        Ext.applyIf(me, {
	    url: "/nodes/" + me.nodename + "/ceph/osd",
            method: 'POST',
            items: [
               {
		   xtype: 'pveCephDiskSelector',
		   name: 'dev',
		   nodename: me.nodename,
		   value: me.dev,
		   diskType: 'unused',
		   fieldLabel: gettext('Disk'),
		   allowBlank: false
	       },
               {
		   xtype: 'pveCephDiskSelector',
		   name: 'journal_dev',
		   nodename: me.nodename,
		   diskType: 'journal_disks',
		   fieldLabel: gettext('Journal Disk'),
		   value: '',
		   autoSelect: false,
		   allowBlank: true,
		   emptyText: 'use OSD disk'
	       }
            ]
        });

        me.callParent();
    }
});

Ext.define('PVE.CephRemoveOsd', {
    extend: 'PVE.window.Edit',
    alias: ['widget.pveCephRemoveOsd'],

    isRemove: true,

    showProgress: true,

    initComponent : function() {
	 /*jslint confusion: true */
        var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}
	if (me.osdid === undefined || me.osdid < 0) {
	    throw "no osdid specified";
	}

	me.create = true;

	me.title = gettext('Remove') + ': ' + 'Ceph OSD osd.' + me.osdid;
 
        Ext.applyIf(me, {
	    url: "/nodes/" + me.nodename + "/ceph/osd/" + me.osdid,
            method: 'DELETE',
            items: [
		{
		    xtype: 'pvecheckbox',
		    name: 'cleanup',
		    checked: true,
		    labelWidth: 130,
		    fieldLabel: gettext('Remove Partitions')
		}
             ]
        });

        me.callParent();
    }
});

Ext.define('PVE.node.CephOsdTree', {
    extend: 'Ext.tree.Panel',
    alias: ['widget.pveNodeCephOsdTree'],

    initComponent: function() {
	 /*jslint confusion: true */
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var sm = Ext.create('Ext.selection.TreeModel', {});

	var set_button_status; // defined later

	var reload = function() {
	    PVE.Utils.API2Request({
                url: "/nodes/" + nodename + "/ceph/osd",
		waitMsgTarget: me,
		method: 'GET',
		failure: function(response, opts) {
		    PVE.Utils.setErrorMask(me, response.htmlStatus);
		},
		success: function(response, opts) {
		    sm.deselectAll();
		    me.setRootNode(response.result.data.root);
		    me.expandAll();
		    set_button_status();
		}
	    });
	};

	var osd_cmd = function(cmd) {
	    var rec = sm.getSelection()[0];
	    if (!(rec && (rec.data.id >= 0) && rec.data.host)) {
		return;
	    }
	    PVE.Utils.API2Request({
                url: "/nodes/" + rec.data.host + "/ceph/osd/" + 
		    rec.data.id + '/' + cmd,
		waitMsgTarget: me,
		method: 'POST',
		success: reload,
		failure: function(response, opts) {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		}
	    });
	};

	var service_cmd = function(cmd) {
	    var rec = sm.getSelection()[0];
	    if (!(rec && rec.data.name && rec.data.host)) {
		return;
	    }
	    PVE.Utils.API2Request({
                url: "/nodes/" + rec.data.host + "/ceph/" + cmd,
		params: { service: rec.data.name },
		waitMsgTarget: me,
		method: 'POST',
		success: function(response, options) {
		    var upid = response.result.data;
		    var win = Ext.create('PVE.window.TaskProgress', { upid: upid });
		    win.show();
		    me.mon(win, 'close', reload, me);
		},
		failure: function(response, opts) {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		}
	    });
	};

	var start_btn = new Ext.Button({
	    text: gettext('Start'),
	    disabled: true,
	    handler: function(){ service_cmd('start'); }
	});

	var stop_btn = new Ext.Button({
	    text: gettext('Stop'),
	    disabled: true,
	    handler: function(){ service_cmd('stop'); }
	});

	var osd_out_btn = new Ext.Button({
	    text: 'Out',
	    disabled: true,
	    handler: function(){ osd_cmd('out'); }
	});

	var osd_in_btn = new Ext.Button({
	    text: 'In',
	    disabled: true,
	    handler: function(){ osd_cmd('in'); }
	});

	var remove_btn = new Ext.Button({
	    text: gettext('Remove'),
	    disabled: true,
	    handler: function(){
		var rec = sm.getSelection()[0];
		if (!(rec && (rec.data.id >= 0) && rec.data.host)) {
		    return;
		}

		var win = Ext.create('PVE.CephRemoveOsd', {
                    nodename: rec.data.host,
		    osdid: rec.data.id
		});
		win.show();
		me.mon(win, 'close', reload, me);
	    }
	});

	set_button_status = function() {
	    var rec = sm.getSelection()[0];

	    if (!rec) {
		start_btn.setDisabled(true);
		stop_btn.setDisabled(true);
		remove_btn.setDisabled(true);
		osd_out_btn.setDisabled(true);
		osd_in_btn.setDisabled(true);
		return;
	    }

	    var isOsd = (rec.data.host && (rec.data.type === 'osd') && (rec.data.id >= 0));

	    start_btn.setDisabled(!(isOsd && (rec.data.status !== 'up')));
	    stop_btn.setDisabled(!(isOsd && (rec.data.status !== 'down')));
	    remove_btn.setDisabled(!(isOsd && (rec.data.status === 'down')));

	    osd_out_btn.setDisabled(!(isOsd && rec.data['in']));
	    osd_in_btn.setDisabled(!(isOsd && !rec.data['in']));
	};

	sm.on('selectionchange', set_button_status);

	var reload_btn = new Ext.Button({
	    text: gettext('Reload'),
	    handler: reload
	});

	Ext.apply(me, {
	    tbar: [ reload_btn, start_btn, stop_btn, osd_out_btn, osd_in_btn, remove_btn ],
	    rootVisible: false,
	    fields: ['name', 'type', 'status', 'host', 'in',
		     { type: 'integer', name: 'id' }, 
		     { type: 'number', name: 'reweight' }, 
		     { type: 'number', name: 'percent_used' }, 
		     { type: 'integer', name: 'bytes_used' }, 
		     { type: 'integer', name: 'total_space' },
		     { type: 'integer', name: 'apply_latency_ms' },
		     { type: 'integer', name: 'commit_latency_ms' },
		     { type: 'number', name: 'crush_weight' }],
	    stateful: false,
	    selModel: sm,
	    columns: [
		{
		    xtype: 'treecolumn',
		    text: 'Name',
		    dataIndex: 'name',
		    width: 150
		},
		{ 
		    text: 'Type',
		    dataIndex: 'type',
		    align: 'right',
		    width: 60		 
		},
		{ 
		    text: 'Status',
		    dataIndex: 'status',
		    align: 'right',
		    renderer: function(value, metaData, rec) {
			if (!value) {
			    return value;
			}
			var data = rec.data;
			return value + '/' + (data['in'] ? 'in' : 'out');
		    },
		    width: 60
		},
		{ 
		    text: 'weight',
		    dataIndex: 'crush_weight',
		    align: 'right',
		    renderer: function(value, metaData, rec) {
			if (rec.data.type !== 'osd') {
			    return '';
			}
			return value;
		    },
		    width: 60
		},
		{ 
		    text: 'reweight',
		    dataIndex: 'reweight',
		    align: 'right',
		    renderer: function(value, metaData, rec) {
			if (rec.data.type !== 'osd') {
			    return '';
			}
			return value;
		    },
		    width: 60
		},
		{
		    header: gettext('Used'),
		    columns: [
			{
			    text: '%',
			    dataIndex: 'percent_used',
			    align: 'right',
			    renderer: function(value, metaData, rec) {
				if (rec.data.type !== 'osd') {
				    return '';
				}
				return Ext.util.Format.number(value, '0.00');
			    },
			    width: 80
			},
			{
			    text: gettext('Total'),
			    dataIndex: 'total_space',
			    align: 'right',
			    renderer: function(value, metaData, rec) {
				if (rec.data.type !== 'osd') {
				    return '';
				}
				return PVE.Utils.render_size(value);
			    },
			    width: 100
			}
		    ]
		},
		{
		    header: gettext('Latency (ms)'),
		    columns: [
			{
			    text: 'Apply',
			    dataIndex: 'apply_latency_ms',
			    align: 'right',
			    renderer: function(value, metaData, rec) {
				if (rec.data.type !== 'osd') {
				    return '';
				}
				return value;
			    },
			    width: 60
			},
			{
			    text: 'Commit',
			    dataIndex: 'commit_latency_ms',
			    align: 'right',
			    renderer: function(value, metaData, rec) {
				if (rec.data.type !== 'osd') {
				    return '';
				}
				return value;
			    },
			    width: 60
			}
		    ]
		}
	    ],
	    listeners: {
		show: function() {
		    reload();
		}
	    }
	});

	me.callParent();

	reload();
    }
});
