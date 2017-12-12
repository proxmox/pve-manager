/*
 * Left Treepanel, containing all the ressources we manage in this datacenter: server nodes, server storages, VMs and Containers
 */
Ext.define('PVE.tree.ResourceTree', {
    extend: 'Ext.tree.TreePanel',
    alias: ['widget.pveResourceTree'],

    statics: {
	typeDefaults: {
	    node: { 
		iconCls: 'fa fa-building',
		text: gettext('Nodes')
	    },
	    pool: { 
		iconCls: 'fa fa-tags',
		text: gettext('Resource Pool')
	    },
	    storage: {
		iconCls: 'fa fa-database',
		text: gettext('Storage')
	    },
	    qemu: {
		iconCls: 'fa fa-desktop',
		text: gettext('Virtual Machine')
	    },
	    lxc: {
		//iconCls: 'x-tree-node-lxc',
		iconCls: 'fa fa-cube',
		text: gettext('LXC Container')
	    },
	    template: {
		iconCls: 'fa fa-file-o'
	    }
	}
    },

    useArrows: true,

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
	    // sort templates after regular VMs
	    if (v1 === 'qemu' || v1 === 'lxc') {
		if (n1.template && !n2.template) {
		    return 1;
		} else if (n2.template && !n1.template) {
		    return -1;
		}
		v1 = n1.vmid;
		v2 = n2.vmid;
		if ((tcmp = v1 > v2 ? 1 : (v1 < v2 ? -1 : 0)) != 0) {
		    return tcmp;
		}
	    }

	    return n1.id > n2.id ? 1 : (n1.id < n2.id ? -1 : 0);
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

	var cls = PVE.Utils.get_object_icon_class(info.type, info);

	if (cls !== '') {
	    info.iconCls = cls;
	}
    },

    // add additional elements to text
    // at the moment only the usage indicator for storages
    setText: function(info) {
	var me = this;

	var status = '';
	if (info.type === 'storage') {
	    var maxdisk = info.maxdisk;
	    var disk = info.disk;
	    var usage = disk/maxdisk;
	    var cls = '';
	    if (usage <= 1.0 && usage >= 0.0) {
		var height = (usage*100).toFixed(0);
		var neg_height = (100-usage*100).toFixed(0);
		status = '<div class="usage-wrapper">';
		status += '<div class="usage-negative" style="height: ';
		status += neg_height + '%"></div>';
		status += '<div class="usage" style="height: '+ height +'%"></div>';
		status += '</div> ';
	    }
	}

	info.text = status + info.text;
    },

    // private
    addChildSorted: function(node, info) {
	var me = this;

	me.setIconCls(info);
	me.setText(info);

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
	var child = Ext.create('PVETree', info);

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
		text: gettext('Datacenter'),
		iconCls: 'fa fa-server'
	    }
	});

	var stateid = 'rid';

	var updateTree = function() {
	    var tmp;

	    store.suspendEvents();

	    var rootnode = me.store.getRootNode();
	    // remember selected node (and all parents)
	    var sm = me.getSelectionModel();

	    var lastsel = sm.getSelection()[0];
	    var reselect = false;
	    var parents = [];
	    var p = lastsel;
	    while (p && !!(p = p.parentNode)) {
		parents.push(p);
	    }

	    var index = pdata.dataIndex;

	    var groups = me.viewFilter.groups || [];
	    var filterfn = me.viewFilter.filterfn;

	    // remove vanished or moved items
	    // update in place changed items
	    var key;
	    for (key in index) {
		if (index.hasOwnProperty(key)) {
		    var olditem = index[key];

		    // getById() use find(), which is slow (ExtJS4 DP5) 
		    //var item = rstore.getById(olditem.data.id);
		    var item = rstore.data.get(olditem.data.id);

		    var changed = false;
		    var moved = false;
		    if (item) {
			// test if any grouping attributes changed
			// this will also catch migrated nodes
			// in server view
			var i, len;
			for (i = 0, len = groups.length; i < len; i++) {
			    var attr = groups[i];
			    if (item.data[attr] != olditem.data[attr]) {
				//console.log("changed " + attr);
				moved = true;
				break;
			    }
			}

			// explicitely check for node, since
			// in some views, node is not a grouping
			// attribute
			if (!moved && item.data.node !== olditem.data.node) {
			    moved = true;
			}

			// tree item has been updated
			if ((item.data.text !== olditem.data.text) ||
			    (item.data.running !== olditem.data.running) ||
			    (item.data.template !== olditem.data.template) ||
			    (item.data.status !== olditem.data.status) ||
			    (item.data.hastate!== olditem.data.hastate)) {
			    //console.log("changed node/text/running " + olditem.data.id);
			    changed = true;
			}

			// fixme: also test filterfn()?
		    }

		    if (changed) {
			olditem.beginEdit();
			//console.log("REM UPDATE UID: " + key + " ITEM " + item.data.running);
			var info = olditem.data;
			Ext.apply(info, item.data);
			me.setIconCls(info);
			me.setText(info);
			olditem.commit();
		    }
		    if ((!item || moved) && olditem.isLeaf()) {
			//console.log("REM UID: " + key + " ITEM " + olditem.data.id);
			delete index[key];
			var parentNode = olditem.parentNode;
			// when the selected item disappears,
			// we have to deselect it here, and reselect it
			// later
			if (lastsel && olditem.data.id === lastsel.data.id) {
			    reselect = true;
			    sm.deselect(olditem);
			}
			// since the store events are suspended, we
			// manually remove the item from the store also
			store.remove(olditem);
			parentNode.removeChild(olditem, true);
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

	    store.resumeEvents();

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
	    } else if (lastsel && reselect) {
		me.selectById(lastsel.data.id);
	    }

	    // on first tree load set the selection from the stateful provider
	    if (!pdata.updateCount) {
		rootnode.collapse();
		rootnode.expand();
		me.applyState(sp.get(stateid));
	    }

	    pdata.updateCount++;
	    store.fireEvent('refresh', store);
	};

	var statechange = function(sp, key, value) {
	    if (key === stateid) {
		me.applyState(value);
	    }
	};

	sp.on('statechange', statechange);

	Ext.apply(me, {
	    allowSelection: true,
	    store: store,
	    viewConfig: {
		// note: animate cause problems with applyState
		animate: false
	    },
	    //useArrows: true,
            //rootVisible: false,
            //title: 'Resource Tree',
	    listeners: {
		itemcontextmenu: PVE.Utils.createCmdMenu,
		destroy: function() {
		    rstore.un("load", updateTree);
		},
		beforecellmousedown: function (tree, td, cellIndex, record, tr, rowIndex, ev) {
		    var sm = me.getSelectionModel();
		    // disable selection when right clicking
		    // except the record is already selected
		    me.allowSelection = (ev.button !== 2) || sm.isSelected(record);
		},
		beforeselect: function (tree, record, index, eopts) {
		    var allow = me.allowSelection;
		    me.allowSelection = true;
		    return allow;
		},
		itemdblclick: PVE.Utils.openTreeConsole
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
		rootnode.removeAll();
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
		    me.getView().focusRow(node);
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
		return node;
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
