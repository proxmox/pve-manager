Ext.define('PVE.qemu.SnapshotTree', {
    extend: 'Ext.tree.Panel',
    alias: ['widget.pveQemuSnapshotTree'],

    reload: function() {
        var me = this;

	console.log("RELOAD");

	PVE.Utils.API2Request({
	    url: '/nodes/' + me.nodename + '/qemu/' + me.vmid + '/snapshot',
	    waitMsgTarget: me,
	    method: 'GET',
	    failure: function(response, opts) {
		PVE.Utils.setErrorMask(me, response.htmlStatus);
	    },
	    success: function(response, opts) {

		var idhash = {};
		var root = { name: '__root', expanded: true, children: [] };
		Ext.Array.each(response.result.data, function(item) {
		    item.leaf = true;
		    item.children = [];
		    idhash[item.name] = item;
		});

		Ext.Array.each(response.result.data, function(item) {
		    if (item.parent && idhash[item.parent]) {
			var parent_item = idhash[item.parent];
			parent_item.children.push(item);
			parent_item.leaf = false;
			parent_item.expanded = true;
		    } else {
			root.children.push(item);
		    }
		});

		console.dir(root);

		me.setRootNode(root);
	    }
	});
    },

    initComponent: function() {
        var me = this;

	me.nodename = me.pveSelNode.data.node;
	if (!me.nodename) { 
	    throw "no node name specified";
	}

	me.vmid = me.pveSelNode.data.vmid;
	if (!me.vmid) {
	    throw "no VM ID specified";
	}

	Ext.apply(me, {
	    layout: 'fit',
	    rootVisible: false,
	    animate: false,

	    fields: ['name', 'description' ],
	    columns: [
		{
		    xtype: 'treecolumn',
		    text: gettext('Name'),
		    dataIndex: 'name',
		    width: 200,
		    renderer: function(value, metaData, record) {
			if (value === '__current') {
			    return "CWD";
			} else {
			    return value;
			}
		    }
		},
		{ 
		    text: gettext('Description'),
		    dataIndex: 'description',
		    flex: 1,
		    renderer: function(value, metaData, record) {
			if (record.data.name === '__current') {
			    return gettext("You are here!");
			} else {
			    return value;
			}
		    }
		}
	    ]
	});

 	me.callParent();

	me.on('show', me.reload);
    }
});

