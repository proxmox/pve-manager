Ext.ns("PVE.grid");

// a grid which displays 'load' exception messages inline
PVE.grid.StdGrid = Ext.extend(Ext.grid.GridPanel, {

    initComponent : function() {
	var self = this;

	if (!self.store)
	    throw "no store specified";

	PVE.grid.StdGrid.superclass.initComponent.call(self);

	var display_exception = function(t, type, action, options, response, arg) {
	    var msg;
	    self.store.removeAll();
	    if (type == 'response') {
		msg = "Error " + response.status + ": " + response.statusText;
	    } else {
		msg = "Data load error";
	    }
	    self.getView().mainBody.update('<div class="x-form-invalid">' + msg + '</div>');
	};

	self.store.on('exception', display_exception); 
	self.on('beforedestroy', function() { self.store.un('exception', display_exception) }); 
    }
});
	
// a special grid to display PVE.data.ObjectStore

PVE.grid.ObjectView = Ext.extend(PVE.grid.StdGrid, {

    initComponent : function() {
	var self = this;

	if (!self.store)
	    throw "no store specified";

	var rows = self.store.rows || {};

	var render_key = function(key) {
	    var rowdef = rows[key] || {};
	    return rowdef.header|| key;
	};

	var render_value = function(value, metaData, record, rowIndex, colIndex, store) {
	    var key = record.data.name;
	    var rowdef = rows[key] || {};

	    var renderer = rowdef.renderer;
	    if (renderer)
		return renderer(value, metaData, record, rowIndex, colIndex, store);

	    return value;
	};

	Ext.apply(self, {
	    hideHeaders: true,
	    stateful: false,
	    enableHdMenu: false,
	    autoExpandColumn: 'value',
	    columns: [
		{
		    header: 'Name',
		    width: self.cwidth1,
		    dataIndex: 'name',
		    sortable: false,
		    renderer: render_key
		},{
		    id: 'value',
		    header: 'Value',
		    dataIndex: 'value',
		    sortable: false,
		    renderer: render_value
		}
	    ],
	    sm: new Ext.grid.RowSelectionModel({singleSelect:true})
	});

	PVE.grid.ObjectView.superclass.initComponent.call(self);
    }
});

Ext.reg('pveObjectView', PVE.grid.ObjectView);

