Ext.ns("PVE");

PVE.DynTreeNode = Ext.extend(Ext.tree.TreeNode, {

   nodeSortFn: function(n1, n2) {
	if ((n1.groupbyid && n2.groupbyid) ||
	    !(n1.groupbyid || n2.groupbyid)) {

	    var tcmp;

	    var v1 = n1.attributes.itype;
	    var v2 = n2.attributes.itype;
	    if ((tcmp = v1 > v2 ? 1 : (v1 < v2 ? -1 : 0)) != 0)
		return tcmp;

	    // var v1 = n1.text.length;
	    // var v2 = n2.text.length;
	    // if ((tcmp = v1 > v2 ? 1 : (v1 < v2 ? -1 : 0)) != 0)
	    // 	return tcmp;

	    return n1.text > n2.text ? 1 : (n1.text < n2.text ? -1 : 0);
	} else if (n1.groupbyid) {
	    return -1;
	} else if (n2.groupbyid) {
	    return 1;
	}
    },

    applyDefaults: function(info) {

	var itype = info.itype;

	if (itype === 'node') {
	    Ext.apply(info, {
		cls: 'x-tree-node-server',
		target: { 
		    xtype: 'pveNodeConfig',
		    nodename: info.itemid
		} 
	    });
	} else if (itype === 'storage') {
	    Ext.apply(info, {
		cls: 'x-tree-node-harddisk',
		target: { 
		    xtype: 'pveStorageBrowser',
		    confdata: info.data
		} 
	    });
	} else if (itype === 'vm') {
	    Ext.apply(info, {
		cls: 'x-tree-node-computer',
		target: { 
		    xtype: 'pveKVMConfig',
		    confdata: info.data
		} 
	    });
	} else {
	    Ext.apply(info, {
		cls: 'x-tree-node-collapsed',
		target: { 
		    title: "Resources",
		    layout: 'fit',
		    border: false,
		    xtype: 'pveConfigPanel'
		} 
	    });
	}
    },

    // fast binary search
    findInsertIndex: function(n, start, end) {
	var diff = end - start;

	var mid = start + (diff>>1);

	if (diff <= 0)
	    return start;

	var res = this.nodeSortFn(n, this.childNodes[mid]);
	if (res <= 0)
	    return this.findInsertIndex(n, start, mid);
	else
	    return this.findInsertIndex(n, mid + 1, end);
    },

    addSorted: function(n) {
        var cs = this.childNodes;
        var len = cs.length;
        var index = this.findInsertIndex(n, 0, len);
	var pos = cs[index]
	this.insertBefore(n, pos);
	return;
    },

    groupChild: function(info, groups, level) {
	var obj = this;
	var groupby = groups[level];

	var v = (groupby === 'itype') ? info.itype : info.data[groupby];

	var add_group = function(nodeinfo, gbid) {
 	    obj.applyDefaults(nodeinfo);
	    nodeinfo.leaf = false;
	    nodeinfo.groupbyid = gbid;
	    nodeinfo.target.showSearch = true;
	    var group = new PVE.DynTreeNode(nodeinfo);
	    obj.addSorted(group);
	    return group;
	};

        if (info.itype === groupby) {

            var group = this.findChild('groupbyid', info.itemid);
	    if (group)
		return group;

	    return add_group(info, info.itemid);

	} else if (v) {
            var group = this.findChild('groupbyid', v);
	    if (!group) {
		var groupinfo = {
		    itype: groupby,
		    itemid: v,
		    text: v
		};
		group = add_group(groupinfo, v);
	    }

	    return group.groupChild(info, groups, level +1);

	}

	this.applyDefaults(info);

	var child = new Ext.tree.TreeNode(info);
	this.addSorted(child);
	return child;
    },

    removeStaleGroups: function() {
	var cs = this.childNodes;

        for(var i = 0, len = cs.length; i < len; i++) {
	    var child = cs[i];
	    if (!child)
		continue;

	    if (!child.hasChildNodes()) {
		if (child.groupbyid) {
		    child.remove(true);
		}
	    } else {
		child.removeStaleGroups();
	    }
	};
    },

    constructor: function(config){
	
        PVE.DynTreeNode.superclass.constructor.call(this, Ext.apply(this, config));	   
    }

});

Ext.tree.TreePanel.nodeTypes.pvedyn = PVE.DynTreeNode;

PVE.ResourceTree = Ext.extend(Ext.tree.TreePanel, {

    viewname: PVE.Utils.default_view,

    initView: function(viewname) {
	this.viewname = viewname;
    },

    setView: function(viewname) {
	var tree = this;

	tree.initView(viewname);

	var sm = this.getSelectionModel();

	var sel = sm.getSelectedNode();

	var oldid;
	if (sel) {
	    oldid = sel.id;
	}

	// make sure we do not show the search panel - for performance reasons
	PVE.Workspace.setView(null);
	
	var rootnode = this.getRootNode();

	this.el.mask('Please wait...', 'x-mask-loading');

	rootnode.collapse(false, false);
	rootnode.removeAll(true);

	this.data = {};

	Ext.each(tree.storelist, function(store) {
	    tree.updateTree(store, store.itype);
	});
	
	rootnode.expand(false, false);
	this.el.unmask();

	if (oldid && this.data[oldid]) {
	    node = this.data[oldid].treenode;
	    if (node) {
		this.selectNode(node);
		return;
	    }		
	}

	this.selectNode(rootnode);

    },

    updateTree: function(store, itype) {

	var tree = this;

	//console.log("update tree " + tree);

	var groups = [].concat(PVE.Utils.default_views[this.viewname].groups);
	var filterfn = PVE.Utils.default_views[this.viewname].filterfn;

	var rootnode = tree.getRootNode();
	if (!rootnode)
	    throw "no rootnode in tree";

	// remove vanished or changed items
	for (var uid in tree.data) {
	    var info =  tree.data[uid];
	    if (!info)
		continue;
	    if (info.itype !== itype)
		continue;

	    var item = store.getById(info.itemid);
	    var changed = false;

	    if (item) {
		// test if any grouping attributes changed
		for (var i = 0, len = groups.length; i < len; i++) {
		    var attr = groups[i];
		    if (attr === 'itype') {
			continue;
		    } else if (item.data[attr] != info.data[attr]) {
			//console.log("changed");
			changed = true;
			break;
		    }
		}
		// fixme: also test filterfn()?
	    }

	    if (!item || changed) {
		info.treenode.remove(); // fixme: destroy?
		tree.data[uid] = null;
	    }

	}

 	// add new items
        store.each(function(item) {
	    var uid = itype + "." + item.id;

	    var olddata = tree.data[uid];

	    if (filterfn && !filterfn(item, itype)) {
		return;
	    }

	    if (!olddata) {
		
		var info = { data: {} };

		Ext.apply(info.data, item.data);

		Ext.apply(info, {
		    itype: itype,
		    id: uid,
		    text: item.id,
		    itemid: item.id,
		    leaf: true
		});		    

		var child = rootnode.groupChild(info, groups, 0);
                if (child) {
		    info.treenode = child;
		    tree.data[uid] = info;
		}

	    }

 	});

	// this can cause unwanted ui updates
 	// remove groups with no children
	// rootnode.removeStaleGroups();

    },

    selectNode: function(sel) {

	sel.ensureVisible();
	sel.select();

	//console.log("SELECT " + sel.attributes.target);
	
	var comp = { pveSelNode: sel };
	Ext.apply(comp, sel.attributes.target);

	PVE.Workspace.setView(comp);
    },

    initComponent: function() {

	var tree = this;

	var rootnode = new PVE.DynTreeNode({
	    expanded: true,
	    id: 'root',
	    text: "Datacenter 1",
	    cls: 'x-tree-node-collapsed',
	    target: { 
		xtype: 'pveClusterConfig',
		clusterid: 'default'
	    } 
	});

	tree.storelist = PVE.Cache.storelist;

	var groupdef = [];
	for (var viewname in PVE.Utils.default_views) {
	    groupdef.push([viewname, PVE.Utils.default_views[viewname].text]);
	};

	var viewcombo = new Ext.form.ComboBox({
	    width: 150,
	    allowBlank: false,
	    editable: false,
	    store: groupdef,
	    forceSelection: true,
	    triggerAction: 'all',
	    value: tree.viewname,
	    listeners: {
		select: function(combo, record, index) { 
		    tree.setView(combo.getValue());
		}		    
	    },
	    getState: function() {
		return { view: this.getValue() };
	    },
	    applyState : function(state) {
		if (state && state.view) {
		    this.setValue(state.view);
		    tree.initView(state.view);
		}
	    },
	    stateEvents: [ 'select' ],
	    stateful: true,
	    stateId: 'pvetreeviewselection'        
	});

	Ext.apply(this, {
	    data: {},
            width: 250,
            title: 'Resource Tree',
	    autoScroll: true,
	    containerScroll: true,
	    rootVisible: true,
	    root:  rootnode,
	    tbar: [
		viewcombo,
		'->', {
		    text: 'Filter',
		    handler: function() {
			if (Ext.get('pvefilterwindow'))
			    return;

			var w = new PVE.Filter({ 
			    loadview: tree.viewname,
			    listeners: {
				changeview: function(view, viewinfo) {
				    PVE.Utils.changeViewDefaults(view, viewinfo);
				    viewcombo.setValue(view);
				    // fixme: save custom view
				    viewcombo.saveState();
				    tree.setView(view);
				} 
			    }
			});
			w.show();
		    }
		}
	    ],
	    listeners: {
		click: function(n) {
		    tree.selectNode(n);
		}
	    }
	});

	tree.initView(tree.viewname);

	PVE.ResourceTree.superclass.initComponent.call(this);

	Ext.each(tree.storelist, function(store) {
	    var update_store = function() {
		tree.updateTree(store, store.itype);
	    };

	    store.on('load', update_store);
	    
	    tree.on('destroy', function () {
		store.un('load', update_store);
	    });
	});

    }

});

Ext.reg('pveResourceTree', PVE.ResourceTree);
