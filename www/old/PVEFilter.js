Ext.namespace('PVE');
 
PVE.FilterGrid = Ext.extend(Ext.grid.EditorGridPanel, {

    constructor : function(config) {

	config = config || {};

	var store = new Ext.data.ArrayStore({
	    // store configs
	    autoDestroy: true,
	    idIndex: 0,  
	    fields: [
		{name: 'attrib', type: 'text'},
		{name: 'cond', type: 'text'},
		{name: 'value', type: 'text'}
	    ]

            //sortInfo: {field:'attrib', direction:'ASC'}

	});

	config.store = store;
	config.autoExpandColumn = 2;

	var comboRenderer = function(combo){
	    return function(value){
		var record = combo.findRecord(combo.valueField, value);
		return record ? record.get(combo.displayField) : combo.valueNotFoundText;
	    }
	}

	var fields = PVE.Utils.getFields();
	var attrib_list = [];
	for (field in fields) {
	    var info = fields[field];
	    attrib_list.push([field, info.header]);
	}

	var attrib_combo = new Ext.form.ComboBox({
	    allowBlank: false,
	    store: attrib_list,
	    forceSelection: true,
	    triggerAction: 'all'
	});

	var cond_list = [
	    [ 'contains', 'Contains' ],
	    [ '==', 'is equal' ],
	    [ '!=', 'is not equal' ]
	];
	var cond_combo = new Ext.form.ComboBox({
	    allowBlank: false,
	    store: cond_list,
	    forceSelection: true,
	    triggerAction: 'all'
	});

	var cm = new Ext.grid.ColumnModel({
            // specify any defaults for each column
            defaults: {
		sortable: true // columns are not sortable by default           
            },
            columns: [
		{
                    header: 'Attribute',
                    dataIndex: 'attrib',
                    width: 220,
		    renderer: comboRenderer(attrib_combo), 
                    editor: attrib_combo
		},
		{
                    header: 'Condition',
                    dataIndex: 'cond',
                    width: 100,
 		    renderer: comboRenderer(cond_combo), 
                    editor: cond_combo
		},
		{
                    header: 'Value',
                    dataIndex: 'value',
                    //width: 220,
                    editor: new Ext.form.TextField({
			allowBlank: false
                    })
		}
	    ]
	});


	Ext.apply(config, {
	    cm: cm,
	    sm: new Ext.grid.RowSelectionModel({
		singleSelect:true
	    }),
	    view: new Ext.grid.GridView({
		markDirty: false
            }),
	    clicksToEdit: 1
	});

	PVE.FilterGrid.superclass.constructor.call(this, config);

    }
});

PVE.Filter = Ext.extend(Ext.Window, {

    constructor : function(config) {
	
	var win = this;

	var viewinfo = PVE.Utils.default_views[config.loadview || PVE.Utils.default_view];

	var grid = new PVE.FilterGrid({ border: false });

	var fields = PVE.Utils.getFields();
	var combo_list = [];
	var checkbox_list = [];
	for (field in fields) {
	    var info = fields[field];
	    combo_list.push([field, info.header]);
	    var cb = {
		boxLabel: info.header, 
		name: field
	    };
	    if (viewinfo.fields[field]) 
		cb.checked = true;
	    checkbox_list.push(new Ext.form.Checkbox(cb));
	}

	combo_list.unshift(['-', "Remove this group"]);

	var groupcbs = [];

	var create_groupby_cb = function(config) {

	    var cb = Ext.apply (config || {}, {
		store: combo_list,
		triggerAction: 'all',
		width: 100,
		listeners: {
		    select: function(combo, rec) {
			var value = rec.get(combo.valueField);
			if (value == '-') {
			    for (var i = 0, len = groupcbs.length; i < len; i++) { 
				if (groupcbs[i] == combo) {
				    groupcbs.splice(i, 1);
				    break;
				}
			    }
			    combo.destroy();
			}
			for (var i = 0, len = groupcbs.length; i < len; i++) { 
			    var cb = groupcbs[i];
			    console.log("TEST " + i + " V = " + cb.getValue());
			}
		    }
		}
	    });

	    return new Ext.form.ComboBox(cb);
	};

	var viewlist = [];
	for (var viewname in PVE.Utils.default_views) {
	    var btn = {
		text: PVE.Utils.default_views[viewname].text,
		itemId: viewname,
		listeners: {
		    click: function(btn) {
			console.log("load view " + btn.itemId);
		    }
		}
	    };
	    viewlist.push(btn);
	};

	var tbar = new Ext.Toolbar({
	    items: [
		{
		    text: 'Load',
		    menu: {
			items: viewlist
		    }
		},
		'-', 
		{
		    text: 'Group by:',
		    listeners: {
			click: function() {
			    if (groupcbs.length >= 3)
				return;
			    for (var i = 0, len = groupcbs.length; i < len; i++) { 
				var cb = groupcbs[i];
				if (!cb.getValue())
				    return;
			    }

			    var tbfill = tbar.findById('tbinsertpos');
			    var pos = tbar.items.indexOf(tbfill);
			    var cb = create_groupby_cb();
			    groupcbs.push(cb);
			    tbar.insertButton(pos, cb);
			    tbar.doLayout();
			}
		    }
		},
		{
		    id: 'tbinsertpos',
		    xtype: 'tbfill'
		},
		{
		    text: 'Add Filter',
		    handler: function() {
			// access the Record constructor through the grid's store
			var store = grid.getStore();
			var rec = store.recordType;
			var p = new rec({ attrib: "Type" , cond: '==' });
			grid.stopEditing();
			store.insert(0, p);
			grid.startEditing(0, 0);
		    }
		},
		'-',
		{
		    text: 'Delete Filter',
		    handler: function() {
			var store = grid.getStore();
			grid.stopEditing();
			var s = grid.getSelectionModel().getSelections();
			for(var i = 0, r; r = s[i]; i++){
			    store.remove(r);
			}
		    }
		},
		'-',
		{
		    text: 'Show fields',
		    menu: {
			xtype: 'menu',
			plain: true,
			items: {
			    xtype: 'checkboxgroup',
			    columns: 1,
			    items: checkbox_list
			}
		    }
		}
	    ]
	});

	Ext.each(viewinfo.groups, function(group) {
	    var tbfill = tbar.findById('tbinsertpos');
	    var pos = tbar.items.indexOf(tbfill);
	    var cb =  create_groupby_cb({ value: group});
	    groupcbs.push(cb);
	    tbar.insertButton(pos, cb);
	});

	var apply_settings = function() {

	    var groups = []
	    Ext.each(groupcbs, function(cb) {
		var v = cb.getValue();
		if (!v || v === '-')
		    return false;
		groups.push(v);
	    });

	    var fields = {};

	    Ext.each(checkbox_list, function(cb) {
		if (cb.checked) 
		    fields[cb.name] = true;
	    });  

	    win.fireEvent('changeview', 'custom', {
		groups: groups,
		fields: fields
	    });
	};

	Ext.apply(win, {
	    id: 'pvefilterwindow',
	    autoDestroy: true,
	    title: "Filter",
	    border: false,
	    width: 600,
	    height: 300,
	    layout: 'fit',
	    tbar: tbar,
	    stateful: false,
	    items: [
		grid
	    ],
	    buttons: [ 
		{ 
		    text: 'Apply',
		    handler: apply_settings
		}, 
		{ 
		    text: 'OK',
		    handler: function() {
			apply_settings();
			win.close();
		    }
		}, 
		{ 
		    text: 'Cancel', 
		    handler: function() { 
			win.close() }
		}
	    ]
	});

	PVE.Filter.superclass.constructor.call(this, config);

	win.addEvents('changeview');


    }
});

Ext.reg('pvefilter', PVE.Filter);