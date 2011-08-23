Ext.ns("PVE");

PVE.StorageContent = Ext.extend(PVE.grid.StdGrid, {

    initComponent : function() {
	var self = this;

	var storeid = self.confdata.storage;
	var node = self.confdata.node || 'localhost';

	if (!storeid)
	    throw "no storage id specified";

	var ct = self.content_type;	
	var params = ct ? { content: ct } : null;

	var store = new Ext.data.JsonStore({
	    url: "/api2/json/nodes/" + node + "/storage/" + storeid,
	    autoDestory: true,
	    root: 'data',
	    restful: true, // use GET, not POST
	    baseParams: params,
	    fields: [ 'format', 'size', 'volid' ]
	});

	Ext.apply(self, {
	    stateful: false,
	    store: store,
	    autoExpandColumn: 'volid',
	    tbar: [
		'->',
		{
		    xtype: 'form',
		    url: "/api2/htmljs/nodes/" + node + "/upload",
		    baseParams:	{ storage: storeid },
		    fileUpload: true,
		    height: 22,
		    border: false,
		    baseCls: 'plain', 
		    items: {
			xtype: 'fileuploadfield',
			name: 'filename',
			buttonOnly: true,
			buttonText: 'Upload',
			listeners: {
			    fileselected: function(field, v) {
				self.el.mask('Please wait...', 'x-mask-loading');
				var form = field.ownerCt.getForm();
				//alert("selected " +  v);
				form.submit({
				    failure: function(f, resp){
					self.el.unmask();
					f.reset();
					var msg = "Please try again";
					if (resp.result && resp.result.message) {
					    msg = resp.result.message;
					} 
					Ext.MessageBox.alert('Failure', "Upload failed. " + msg);
				    },
				    success: function(f, resp){
					self.el.unmask();
					f.reset();
					Ext.MessageBox.alert('Failure', "Upload succesful");
				    }
				});
			    }
			}
 		    }
		}
	    ],	    
	    columns: [
		{
		    id: 'volid',
		    header: 'Name',
		    dataIndex: 'volid'
		},
		{
		    header: 'Format',
		    width: 100,
		    dataIndex: 'format'
		},
		{
		    header: 'Size',
		    width: 100,
		    renderer: PVE.Utils.format_size,
		    dataIndex: 'size'
		}
	    ],

	    listeners: {
		show: function() {
		    store.load();
		}
	    },

	    sm: new Ext.grid.RowSelectionModel({singleSelect:true})

	});

	PVE.StorageContent.superclass.initComponent.call(self);
    }
});

Ext.reg('pveStorageContent', PVE.StorageContent);

PVE.StorageStatus = Ext.extend(PVE.grid.ObjectView, {

    initComponent : function() {
	var self = this;

	var storeid = self.confdata.storage;
	var node = self.confdata.node ||  'localhost';

	if (!storeid)
	    throw "no storage id specified";

	var store = new PVE.data.ObjectStore({
	    url: "/api2/json/nodes/" + node + "/storage/",
	    baseParams: { storage: storeid },
	    method: 'GET',
	    restful: true, // use GET, not POST
	    autoDestroy: true,
	    rows: {
		total: { header: 'Capacity' },
		used: { header: 'Used' },
		free: { header: 'Free' }
	    }
	});

	store.load();

	Ext.apply(self, {
	    layout: 'fit',
	    tbar: [ 
		"<b>Status", '->',
		{ 
		    text: "Refresh",
		    handler: function() { store.load(); }
		}
	    ],
	    store: store
	});

	PVE.StorageStatus.superclass.initComponent.call(self);
    }
});

PVE.StorageSummary = Ext.extend(Ext.Panel, {

    initComponent : function() {
	var self = this;

	var storeid = self.confdata.storage;

	var update_config = function() {
	    self.store.load();
	};

	Ext.apply(self, {
	    layout: 'hbox',
	    autoScroll: true,

	    layoutConfig: {
		defaultMargins: "10 10 10 0",
		align: 'stretchmax'
	    },

	    items: [
		{
		    xtype: 'pveObjectView',
		    store: self.store,
		    margins: "10 10 10 10",
		    height: 200,
		    width: 300,
		    tbar: [
			"<b>Configuration", "->", 
			{ 
			    text: "Edit",
			    handler: function() {

				var form =  new PVE.form.ModifyDirStorage({
				    confdata: self.confdata
				});
				var win = new PVE.window.ModalDialog({
				    title: "Modify Directory Storage",
				    items: form,
				    width: 400,
				    height: 300,
				    buttons: [
					{
					    text: 'OK',
					    handler: function(){
						form.submitHandler({
						    success: function() { 
							win.close();
							update_config();
						    }
						});
					    }
					},{
					    text: 'Cancel',
					    handler: function(){
						win.close();
						update_config();
					    }
					}
				    ]
				});

				win.show();
			    }
			}
		    ]
		    //flex: 1,
		},
		new PVE.StorageStatus ({
		    confdata: self.confdata,
 		    height: 200,
		    width: 300
		})
	    ]
	});

	PVE.StorageSummary.superclass.initComponent.call(self);
    }
});

Ext.reg('pveStorageSummary', PVE.StorageSummary);

PVE.StorageBrowser = Ext.extend(PVE.ConfigPanel, {

    initComponent : function() {
	var self = this;

	var node = self.confdata.node;
	var storeid = self.confdata.storage;
	var shared =  self.confdata.shared;

	if (!storeid) 
	    throw "no storage ID specified";

	if (!shared && !node) 
	    throw "no node specified";

	var title = "Storage '" + storeid + "'";
	
	if (!shared)
	    title = title + " on node '" + node + "'";

	var cond_view_comp = function(id, enable) {

	    var tabs = self.get(0);
	    var comp = self.findById(id);
	    if (!comp)
		return;

	    if (enable) {
		tabs.unhideTabStripItem(id);
	    } else {
		var active = tabs.getActiveTab();
		tabs.hideTabStripItem(id);
		if (active) {
		    active = Ext.isObject(active) ? active.getId() : active;
		    if (active === id) {
			tabs.setActiveTab(0);
		    }
		}
	    }
	};
	
	var store = new PVE.data.ObjectStore({
	    url: "/api2/json/storage/" + storeid,
	    method: 'GET',
	    autoDestory: true,
	    rows: {
		type: { header: 'Storage Type', renderer: PVE.Utils.format_storage_type },
		path: { header: 'Path' },
		shared: { header: 'Shared', renderer: PVE.Utils.format_boolean },
		disable: { header: 'Disabled', renderer: PVE.Utils.format_boolean },
		content: { header: 'Content', renderer: PVE.Utils.format_content_types }
	    }
	});

	var set_visible_tabs = function() {
	    var rec = store.getById('content');
	    if (!rec)
		return;

	    var ct = rec.data.value || '';
	    var cthash = {};
	    Ext.each(ct.split(','), function(item) { cthash[item] = 1 });

	    cond_view_comp('images', cthash.images);
	    cond_view_comp('iso', cthash.iso);
	    cond_view_comp('vztmpl', cthash.vztmpl);
	    cond_view_comp('backup', cthash.backup);
	};

	store.on('load',  set_visible_tabs);

	Ext.apply(self, {
	    title: title, 
	    layout: 'fit',
  	    border: false,

	    defaults: { 
		border: false
	    },
	    items: [
		{
		    title: 'Summary',
		    xtype: 'pveStorageSummary',
		    listeners: {
			show: function() {
			    store.load();
			}
		    },
		    confdata: self.confdata,
		    store: store,
		    id: 'status'
		},
		{
		    xtype: 'pveStorageContent',
		    confdata: self.confdata,
		    content_type: 'images',
		    title: 'Images',
		    id: 'images'
		},
		{
		    xtype: 'pveStorageContent',
		    confdata: self.confdata,
		    content_type: 'iso',
		    title: 'ISO',
		    id: 'iso'
		},
		{
		    xtype: 'pveStorageContent',
		    confdata: self.confdata,
		    content_type: 'vztmpl',
		    title: 'Templates',
		    id: 'vztmpl'
		},
		{
		    xtype: 'pveStorageContent',
		    confdata: self.confdata,
		    content_type: 'backup',
		    title: 'Backups',
		    id: 'backup'
		},
		{
		    title: 'Permissions',
		    id: 'permissions',
		    html: 'services '
		}
	    ]
	});
	
	PVE.StorageBrowser.superclass.initComponent.call(self);
    }
});

Ext.reg('pveStorageBrowser', PVE.StorageBrowser);

