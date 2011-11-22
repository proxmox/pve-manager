Ext.define('PVE.tree.ResourceTree', {
    extend: 'Ext.tree.TreePanel',
    requires: ['Ext.tree.*', 
	       'Ext.state.Manager',
	       'PVE.Utils', 
	       'PVE.data.ResourceStore'],
    alias: ['widget.pveResourceTree'],

    statics: {
	typeDefaults: {
	    node: { 
		iconCls: 'x-tree-node-server',
		text: gettext('Node list')
	    },
	    storage: {
		iconCls: 'x-tree-node-harddisk',
		text: gettext('Storage list')
	    },
	    qemu: {
		iconCls: 'x-tree-node-computer',
		text: gettext('Virtual machines')
	    },
	    openvz: {
		iconCls: 'x-tree-node-openvz',
		text: gettext('OpenVZ containers')
	    } 
	}
    },

    // private
    nodeSortFn: function(node1, node2) {
	var n1 = node1.data;
	var n2 = node2.data;

	if ((n1.groupbyid && n2.groupbyid) ||
	    !(n1.groupbyid || n2.groupbyid)) {

	    var tcmp;

	    var v1 = n1.type;
	    var v2 = n2.type;

	    if ((tcmp = v1 > v2 ? 1 : (v1 < v2 ? -1 : 0)) != 0) {
		return tcmp;
	    }

	    // numeric compare for VM IDs
	    if (v1 === 'qemu' || v1 === 'openvz') {
		v1 = n1.vmid;
		v2 = n2.vmid;
		if ((tcmp = v1 > v2 ? 1 : (v1 < v2 ? -1 : 0)) != 0) {
		    return tcmp;
		}
	    }

	    return n1.text > n2.text ? 1 : (n1.text < n2.text ? -1 : 0);
	} else if (n1.groupbyid) {
	    return -1;
	} else if (n2.groupbyid) {
	    return 1;
	}
    },

    // private: fast binary search
    findInsertIndex: function(node, child, start, end) {
	var me = this;

	var diff = end - start;

	var mid = start + (diff>>1);

	if (diff <= 0) {
	    return start;
	}

	var res = me.nodeSortFn(child, node.childNodes[mid]);
	if (res <= 0) {
	    return me.findInsertIndex(node, child, start, mid);
	} else {
	    return me.findInsertIndex(node, child, mid + 1, end);
	}
    },

    setIconCls: function(info) {
	var me = this;

	var defaults = PVE.tree.ResourceTree.typeDefaults[info.type];
	if (defaults && defaults.iconCls) {
	    if (info.running) {
		info.iconCls = defaults.iconCls + "-running";
	    } else {
		info.iconCls = defaults.iconCls;
	    }
	}
    },

    // private
    addChildSorted: function(node, info) {
	var me = this;

	me.setIconCls(info);

	var defaults;
	if (info.groupbyid) {
	    info.text = info.groupbyid;	    
	    if (info.type === 'type') {
		defaults = PVE.tree.ResourceTree.typeDefaults[info.groupbyid];
		if (defaults && defaults.text) {
		    info.text = defaults.text;
		}
	    }
	}
	var child = Ext.ModelMgr.create(info, 'PVETree', info.id);

        var cs = node.childNodes;
	var pos;
	if (cs) {
	    pos = cs[me.findInsertIndex(node, child, 0, cs.length)];
	}

	node.insertBefore(child, pos);

	return child;
    },

    // private
    groupChild: function(node, info, groups, level) {
	var me = this;

	var groupby = groups[level];
	var v = info[groupby];

	if (v) {
            var group = node.findChild('groupbyid', v);
	    if (!group) {
		var groupinfo;
		if (info.type === groupby) {
		    groupinfo = info;
		} else {
		    groupinfo = {
			type: groupby,
			id : groupby + "/" + v
		    };
		    if (groupby !== 'type') {
			groupinfo[groupby] = v;
		    }
		}
		groupinfo.leaf = false;
		groupinfo.groupbyid = v; 
		group = me.addChildSorted(node, groupinfo);
		// fixme: remove when EXTJS has fixed those bugs?!
		group.expand(); group.collapse();
	    }
	    if (info.type === groupby) {
		return group;
	    }
	    if (group) {
		return me.groupChild(group, info, groups, level + 1);
	    }
	}

	return me.addChildSorted(node, info);
    },

    initComponent : function() {
	var me = this;

	var rstore = PVE.data.ResourceStore;
	var sp = Ext.state.Manager.getProvider();

	if (!me.viewFilter) {
	    me.viewFilter = {};
	}

	var pdata = {
	    dataIndex: {},
	    updateCount: 0
	};

	var store = Ext.create('Ext.data.TreeStore', {
	    model: 'PVETree',
	    root: {
		expanded: true,
		id: 'root',
		text: gettext('Datacenter')
	    }
	});

	var stateid = 'rid';

	var updateTree = function() {
	    var tmp;

	    // fixme: suspend events ?

	    var rootnode = me.store.getRootNode();
	    
	    // remember selected node (and all parents)
	    var sm = me.getSelectionModel();

	    var lastsel = sm.getSelection()[0];
	    var parents = [];
	    var p = lastsel;
	    while (p && !!(p = p.parentNode)) {
		parents.push(p);
	    }

	    var index = pdata.dataIndex;

	    var groups = me.viewFilter.groups || [];
	    var filterfn = me.viewFilter.filterfn;

	    // remove vanished or changed items
	    var key;
	    for (key in index) {
		if (index.hasOwnProperty(key)) {
		    var olditem = index[key];

		    // getById() use find(), which is slow (ExtJS4 DP5) 
		    //var item = rstore.getById(olditem.data.id);
		    var item = rstore.data.get(olditem.data.id);

		    var changed = false;
		    if (item) {
			// test if any grouping attributes changed
			var i, len;
			for (i = 0, len = groups.length; i < len; i++) {
			    var attr = groups[i];
			    if (item.data[attr] != olditem.data[attr]) {
				//console.log("changed " + attr);
				changed = true;
				break;
			    }
			}
			if ((item.data.text !== olditem.data.text) ||
			    (item.data.node !== olditem.data.node) ||
			    (item.data.running !== olditem.data.running)) {
			    //console.log("changed node/text/running " + olditem.data.id);
			    changed = true;
			}

			// fixme: also test filterfn()?
		    }

		    if (!item || changed) {
			//console.log("REM UID: " + key + " ITEM " + olditem.data.id);
			if (olditem.isLeaf()) {
			    delete index[key];
			    var parentNode = olditem.parentNode;
			    parentNode.removeChild(olditem, true);
			} else {
			    if (item && changed) {
				olditem.beginEdit();
				//console.log("REM UPDATE UID: " + key + " ITEM " + item.data.running);
				var info = olditem.data;
				Ext.apply(info, item.data);
				me.setIconCls(info);
				olditem.commit();
			    }
			}
		    }
		}
	    }

	    // add new items
            rstore.each(function(item) {
		var olditem = index[item.data.id];
		if (olditem) {
		    return;
		}

		if (filterfn && !filterfn(item)) {
		    return;
		}

		//console.log("ADD UID: " + item.data.id);

		var info = Ext.apply({ leaf: true }, item.data);

		var child = me.groupChild(rootnode, info, groups, 0);
		if (child) {
		    index[item.data.id] = child;
		}
	    });

	    // select parent node is selection vanished
	    if (lastsel && !rootnode.findChild('id', lastsel.data.id, true)) {
		lastsel = rootnode;
		while (!!(p = parents.shift())) {
		    if (!!(tmp = rootnode.findChild('id', p.data.id, true))) {
			lastsel = tmp;
			break;
		    }
		}
		me.selectById(lastsel.data.id);
	    }

	    if (!pdata.updateCount) {
		rootnode.collapse();
		rootnode.expand();
		me.applyState(sp.get(stateid));
	    }

	    pdata.updateCount++;
	};

	var statechange = function(sp, key, value) {
	    if (key === stateid) {
		me.applyState(value);
	    }
	};

	sp.on('statechange', statechange);

	Ext.apply(me, {
	    store: store,
	    viewConfig: {
		// note: animate cause problems with applyState
		animate: false
	    },
	    //useArrows: true,
            //rootVisible: false,
            //title: 'Resource Tree',
	    listeners: {
		itemcontextmenu: function(v, record, item, index, event) {
		    event.stopEvent();
		    //v.select(record);
		    var menu;
		    
		    if (record.data.type === 'qemu') {
			menu = Ext.create('PVE.qemu.CmdMenu', {
			    vmid: record.data.vmid,
			    nodename: record.data.node
			});
		    } else if (record.data.type === 'openvz') {
			menu = Ext.create('PVE.openvz.CmdMenu', {
			    vmid: record.data.vmid,
			    nodename: record.data.node
			});
		    } else {
			return;
		    }

		    menu.showAt(event.getXY());
		},
		destroy: function() {
		    rstore.un("load", updateTree);
		}
	    },
	    setViewFilter: function(view) {
		me.viewFilter = view;
		me.clearTree();
		updateTree();
	    },
	    clearTree: function() {
		pdata.updateCount = 0;
		var rootnode = me.store.getRootNode();
		rootnode.collapse();
		rootnode.removeAll(true);
		pdata.dataIndex = {};
		me.getSelectionModel().deselectAll();
	    },
	    selectExpand: function(node) {
		var sm = me.getSelectionModel();
		if (!sm.isSelected(node)) {
		    sm.select(node);
		    var cn = node;
		    while (!!(cn = cn.parentNode)) {
			if (!cn.isExpanded()) {
			    cn.expand();
			}
		    }
		}
	    },
	    selectById: function(nodeid) {
		var rootnode = me.store.getRootNode();
		var sm = me.getSelectionModel();
		var node;
		if (nodeid === 'root') {
		    node = rootnode;
		} else {
		    node = rootnode.findChild('id', nodeid, true);
		}
		if (node) {
		    me.selectExpand(node);
		}
	    },
	    checkVmMigration: function(record) {
		if (!(record.data.type === 'qemu' || record.data.type === 'openvz')) {
		    throw "not a vm type";
		}

		var rootnode = me.store.getRootNode();
		var node = rootnode.findChild('id', record.data.id, true);

		if (node && node.data.type === record.data.type &&
		    node.data.node !== record.data.node) {
		    // defer select (else we get strange errors)
		    Ext.defer(function() { me.selectExpand(node); }, 100, me);
		}
	    },
	    applyState : function(state) {
		var sm = me.getSelectionModel();
		if (state && state.value) {
		    me.selectById(state.value);
		} else {
		    sm.deselectAll();
		}
	    }
	});

	me.callParent();

	var sm = me.getSelectionModel();
	sm.on('select', function(sm, n) {		    
	    sp.set(stateid, { value: n.data.id});
	});

	rstore.on("load", updateTree);
	rstore.startUpdate();
	//rstore.stopUpdate();
    }

});
