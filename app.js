const express = require("express");
const { open } = require("sqlite");
const path = require("path");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
let db = null;

const initializeDataBaseAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running on http://localhost:3000");
    });
  } catch (e) {
    console.log(`Db error ${e.message}`);
    process.exit(1);
  }
};

initializeDataBaseAndServer();

const convertStatDbObjectIntoResponseObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const convertDistrictDbObjectIntoResponseObject = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

app.post("/users/", async (request, response) => {
  const { username, name, password, gender, location } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  const getTheUserQuery = `
  SELECT
  *
   FROM
   user
   WHERE
   username = '${username}';`;
  const dbUser = await db.get(getTheUserQuery);
  if (dbUser === undefined) {
    const createNewUserQuery = `
      INSERT
      INTO
      user(username,name,password,gender,location)
      VALUES('${username}' , '${name}' , '${hashedPassword}' , '${gender}' , '${location}');`;
    await db.run(createNewUserQuery);
    response.send("User Created Successfully");
  } else {
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getTheUserQuery = `
  SELECT
  *
   FROM
   user
   WHERE
   username = '${username}';`;
  const dbUser = await db.get(getTheUserQuery);
  if (dbUser !== undefined) {
    isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "mySecretMessage");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

const authenticationWithToken = (request, response, next) => {
  let jwtToken;
  const authHeaders = request.headers["authorization"];
  if (authHeaders !== undefined) {
    jwtToken = authHeaders.split(" ")[1];
    if (jwtToken === undefined) {
      response.status(401);
      response.send("Invalid JWT Token");
    } else {
      jwt.verify(jwtToken, "mySecretMessage", async (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          next();
        }
      });
    }
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

app.get("/states/", authenticationWithToken, async (request, response) => {
  const getStatesQuery = `
    SELECT
    * 
    FROM
    state;`;
  const statesArray = await db.all(getStatesQuery);
  response.send(
    statesArray.map((eachState) => {
      return convertStatDbObjectIntoResponseObject(eachState);
    })
  );
});

app.get(
  "/states/:stateId/",
  authenticationWithToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getStateQuery = `SELECT * FROM state WHERE state_id = ${stateId};`;
    const state = await db.get(getStateQuery);
    response.send(convertStatDbObjectIntoResponseObject(state));
  }
);

app.post("/districts/", authenticationWithToken, async (request, response) => {
  try {
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const addNewDistrict = `
    INSERT
    INTO
    district
    (district_name,state_id,cases,cured,active,deaths)
    VALUES('${districtName}' , ${stateId} , ${cases} , ${cured} , ${active} , ${deaths});`;
    await db.run(addNewDistrict);
    response.send("District Successfully Added");
  } catch (error) {
    console.log(error);
  }
});

app.get(
  "/districts/:districtId/",
  authenticationWithToken,
  async (request, response) => {
    try {
      const { districtId } = request.params;
      const getDistrictQuery = `
    SELECT
    * 
    FROM
    district
    WHERE 
    district_id = ${districtId};`;
      const district = await db.get(getDistrictQuery);
      response.send(convertDistrictDbObjectIntoResponseObject(district));
    } catch (error) {
      console.log(error);
    }
  }
);

app.delete(
  "/districts/:districtId/",
  authenticationWithToken,
  async (request, response) => {
    try {
      const { districtId } = request.params;
      const deleteDistrictQuery = `
    DELETE
    FROM
    district
    WHERE
    district_id = ${districtId};`;
      await db.run(deleteDistrictQuery);
      response.send("District Removed");
    } catch (e) {
      console.log(e);
    }
  }
);

app.put(
  "/districts/:districtId/",
  authenticationWithToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateDistrictQuery = `
    UPDATE
    district
    SET
    district_name = '${districtName}',
    state_id = ${stateId},
    cases = ${cases},
    cured = ${cured},
    active = ${active},
    deaths = ${deaths}
    WHERE
    district_id = ${districtId};`;
    await db.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

app.get(
  "/states/:stateId/stats/",
  authenticationWithToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getTheStatsQuery = `
    SELECT
    SUM(cases),
    SUM(cured),
    SUM(active),
    SUM(deaths)
    FROM
    state 
    NATURAL JOIN
    district
    WHERE
    state_id = ${stateId};`;
    const result = await db.get(getTheStatsQuery);
    response.send({
      totalCases: result["SUM(cases)"],
      totalCured: result["SUM(cured)"],
      totalActive: result["SUM(active)"],
      totalDeaths: result["SUM(deaths)"],
    });
  }
);
module.exports = app;
